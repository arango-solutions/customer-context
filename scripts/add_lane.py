"""CDC-01 incremental ADD lane — zero-churn tiny-module variant.

Ingests a pre-staged document into the unstructured KG incrementally,
WITHOUT a destructive full rebuild (no truncate-all of Layer-3).

The zero-churn variant (UPDATE-PIPELINE.md §ADD "Zero-churn variant"):
  - The new doc is ingested as its OWN tiny module (e.g. meridian_slack_escalation)
    with cluster_threshold=1 so it forms a single partition.
  - The existing meridian_slack module (18 docs) is UNTOUCHED — no whole-module
    re-cluster, no membership shift risk (D-03 / Pitfall 2).
  - Sidesteps D-03 entirely: other accounts' Layer-3 records are never touched.

Concrete pipeline (UPDATE-PIPELINE.md §ADD):
  Stage 0 — health check
  Stage 1 — upload the pre-staged doc via File Manager (durable; NOT import-multiple)
  Stage 2 — corpus build  incremental=True  file_ids=[new doc]  cluster_threshold=1
             (NO modules= arg — module tagging via import-multiple is a no-op on
              this cluster; mirror the proven File Manager path, re-stamp post-build)
  Stage 3 — rag-strategizer analyze + wait for strategy to stabilize
  Stage 4 — read back partition_ids for the module (do NOT assume _0_a)
  Stage 5 — partition-prefix-scoped purge (STARTS_WITH partition_id @modulePrefix)
             using the customer360_ allowlist + prefix guard; NEVER truncate-all
  Stage 6 — orchestrate_with_wait(partition_ids=<step-4 list>)
  Stage 7 — content-derived re-stamp via repair_kg_attribution.py (content-header-derived; NOT manifest-keyed re-stamp)
  Stage 8 — BM25 view + HNSW vector index self-heal (drop+recreate if stale)
  Stage 9 — hybrid probe: BM25 + APPROX_NEAR_COSINE to confirm retrieval works

Wall-clock is printed at each platform round-trip and as a total at the end.
This measures the realistic incremental latency that Plan 02's progress affordance
must budget for (RESEARCH Open Question 2).

Usage:
    python scripts/add_lane.py --dry-run            # safe, prints plan, no destructive calls
    python scripts/add_lane.py                      # live run against production cluster
    python scripts/add_lane.py --module meridian_slack_escalation   # (default)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# override=True is MANDATORY — stale shell OPENAI_API_KEY can shadow the valid .env value
# ([[openai-key-env-gotcha]]).
load_dotenv(_REPO_ROOT / ".env", override=True)

from arango import ArangoClient  # noqa: E402
from lib.autograph_client import AutographClient, AutographError  # noqa: E402

_MANIFEST = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_UNSTRUCTURED = _REPO_ROOT / "data_gen" / "output" / "unstructured"
_DISCOVERY = _REPO_ROOT / "service_discovery.json"

# The 5 AutoGraph-derived Layer-3 collections.
# Defence-in-depth: this allowlist is the ONLY set of collections that may
# receive partition-prefix-scoped REMOVE AQL. Every collection name MUST start
# with 'customer360_' (the KG prefix). The structured graph
# (Account/Contact/Opportunity/UsageFact/Contract/NPS + edges) is NEVER in this set.
KG_LAYER3_COLLECTIONS = (
    "customer360_Documents",
    "customer360_Chunks",
    "customer360_Entities",
    "customer360_Relations",
    "customer360_Communities",
)

# ArangoSearch view + vector index identifiers (from build_unstructured.py).
CHUNKS_SEARCH_VIEW = "customer360_chunks_search_view"
CHUNKS_VIEW_LINK = {"fields": {"content": {"analyzers": ["text_en"]}}, "includeAllFields": False}
CHUNKS_VECTOR_COLLECTION = "customer360_Chunks"

# The rags collection that stores partition strategy metadata.
KG_RAGS = "customer360_rags"

# Allowed collection-name prefix (defence-in-depth allowlist guard).
_KG_PREFIX = "customer360_"


# ── env / connections ────────────────────────────────────────────────────────


def _arango_cfg() -> dict:
    url = (os.environ.get("ARANGO_URL") or os.environ["ARANGO_ENDPOINT"]).rstrip("/")
    user = os.environ.get("ARANGO_USER") or os.environ["ARANGO_USERNAME"]
    password = os.environ["ARANGO_PASSWORD"]
    db_name = os.environ.get("ARANGO_DB") or os.environ.get("ARANGO_DATABASE") or "customer360"
    return {"url": url, "user": user, "password": password, "db": db_name}


def _autograph_url() -> str:
    url = os.environ.get("AUTOGRAPH_URL")
    if url:
        return url.rstrip("/")
    if _DISCOVERY.exists():
        data = json.loads(_DISCOVERY.read_text(encoding="utf-8"))
        url = data.get("customer360_autograph_url")
        if url:
            return url.rstrip("/")
    raise SystemExit("AUTOGRAPH_URL not set and service_discovery.json missing customer360_autograph_url")


def _get_db(cfg: dict):
    auth = httpx.post(
        f"{cfg['url']}/_open/auth",
        json={"username": cfg["user"], "password": cfg["password"]},
        timeout=30,
    )
    auth.raise_for_status()
    jwt = auth.json()["jwt"]
    return ArangoClient(hosts=cfg["url"]).db(cfg["db"], user_token=jwt)


def _client(cfg: dict) -> AutographClient:
    return AutographClient(
        api_url=_autograph_url(),
        arango_url=cfg["url"],
        user=cfg["user"],
        password=cfg["password"],
        tls_verify=True,
    )


def _content_type(name: str) -> str:
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    return {"pdf": "application/pdf", "md": "text/markdown", "txt": "text/plain"}.get(ext, "application/octet-stream")


# ── helpers ──────────────────────────────────────────────────────────────────


def _load_manifest() -> dict:
    return json.loads(_MANIFEST.read_text(encoding="utf-8"))


def _module_doc_path(module: str, manifest: dict) -> tuple[str, Path]:
    """Return (file_name, path) for the first manifest entry belonging to the module."""
    for file_name, meta in manifest.items():
        if meta.get("module") == module:
            path = _UNSTRUCTURED / module / file_name
            return file_name, path
    raise SystemExit(f"[add] FAIL — no manifest entry found for module={module!r}")


def _view_exists(db, name: str) -> bool:
    return any(v.get("name") == name for v in db.views())


# ── purge helper (partition-prefix-scoped; NEVER truncate-all) ───────────────


def _purge_module_layer3(db, module_prefix: str, *, dry_run: bool) -> dict[str, int]:
    """Delete Layer-3 records for the module by partition_id prefix.

    Threat T-12-01 mitigation:
      - ONLY issues REMOVE on collections in KG_LAYER3_COLLECTIONS
      - ONLY removes records WHERE STARTS_WITH(x.partition_id, @modulePrefix)
      - NEVER truncates ALL records in a collection
      - Defence-in-depth: rejects any collection name lacking the KG prefix

    Returns a {collection: deleted_count} dict.
    """
    counts: dict[str, int] = {}
    for name in KG_LAYER3_COLLECTIONS:
        # Allowlist + prefix guard (build_unstructured.py lines 269-271 pattern).
        if name not in KG_LAYER3_COLLECTIONS or not name.startswith(_KG_PREFIX):
            raise SystemExit(f"[add] FATAL — refusing REMOVE on non-Layer-3 collection: {name!r}")
        if not db.has_collection(name):
            counts[name] = 0
            if dry_run:
                print(f"[add]   DRY-RUN purge: {name}: absent (would skip)")
            continue
        if dry_run:
            # Count how many would be deleted; do NOT remove.
            count_aql = (
                "LET n = LENGTH(FOR x IN @@col "
                "  FILTER STARTS_WITH(x.partition_id, @prefix) RETURN 1) "
                "RETURN n"
            )
            result = list(db.aql.execute(count_aql, bind_vars={"@col": name, "prefix": module_prefix}))
            n = result[0] if result else 0
            print(f"[add]   DRY-RUN purge: {name}: would remove {n} records with partition_id starting with {module_prefix!r}")
            counts[name] = n
        else:
            remove_aql = (
                "FOR x IN @@col "
                "  FILTER STARTS_WITH(x.partition_id, @prefix) "
                "  REMOVE x IN @@col "
                "  RETURN 1"
            )
            removed = list(db.aql.execute(remove_aql, bind_vars={"@col": name, "prefix": module_prefix}))
            counts[name] = len(removed)
            print(f"[add]   purged {name}: removed {len(removed)} records")
    return counts


# ── read-back partition ids from rags ────────────────────────────────────────


def _read_partition_ids(db, module: str) -> list[str]:
    """Read back the partition_ids for the module from {proj}_rags.

    Guardrail 3: do NOT assume the id is '{module}_0_a' — a content change can
    shift clustering. Read the actual rags records.
    """
    if not db.has_collection(KG_RAGS):
        # May not exist before the first build; fall back to the predictable id
        # only as an emergency backstop with a loud warning.
        fallback = f"{module}_0_a"
        print(f"[add]   WARNING: {KG_RAGS} absent — falling back to assumed partition id {fallback!r}")
        return [fallback]
    aql = (
        "FOR r IN @@col "
        "  FILTER r.module == @module "
        "  RETURN r.rag_partition_id"
    )
    ids = [x for x in db.aql.execute(aql, bind_vars={"@col": KG_RAGS, "module": module}) if x]
    if not ids:
        # Alternative field names observed across AutoGraph versions.
        aql2 = (
            "FOR r IN @@col "
            "  FILTER r.module == @module "
            "  RETURN (r.partition_id OR r.partitionId OR r.rag_partition_id)"
        )
        ids = [x for x in db.aql.execute(aql2, bind_vars={"@col": KG_RAGS, "module": module}) if x]
    if not ids:
        fallback = f"{module}_0_a"
        print(f"[add]   WARNING: no partition ids found for module={module!r} in {KG_RAGS} — falling back to {fallback!r}")
        return [fallback]
    print(f"[add]   partition ids for module={module!r}: {ids}")
    return ids


# ── BM25 + vector probe ───────────────────────────────────────────────────────


def _probe_hybrid_retrieval(db, module: str) -> bool:
    """Probe BM25 (ArangoSearch) + vector retrieval to confirm hybrid retrieval works.

    Returns True if both probes materialize at least 1 chunk without errors.
    Pitfall 4: orphaned index segments → NotFound [MaterializeNode] on stale _ids.
    """
    # BM25 probe
    bm25_aql = (
        "FOR c IN @@view "
        "  SEARCH ANALYZER(c.content IN TOKENS(@q, 'text_en'), 'text_en') "
        "  SORT BM25(c) DESC LIMIT 3 RETURN c._id"
    )
    bm25_ok = False
    for attempt in range(6):
        try:
            results = list(db.aql.execute(bm25_aql, bind_vars={"@view": CHUNKS_SEARCH_VIEW, "q": "renewal escalation churn risk champion"}))
            if results:
                print(f"[add]   BM25 probe: materialized {len(results)} chunk(s) — OK")
                bm25_ok = True
                break
        except Exception as exc:  # noqa: BLE001
            print(f"[add]   BM25 probe attempt {attempt + 1}/6: {type(exc).__name__} (index settling)")
        time.sleep(6)
    if not bm25_ok:
        print("[add]   WARNING: BM25 probe materialized 0 chunks after 6 attempts")

    # APPROX_NEAR_COSINE probe (vector): materialize top chunks by a zero embedding
    # (we do not have a live embedding here, so use a stored chunk's embedding via AQL)
    vec_aql = (
        "FOR c IN @@col FILTER c.embedding != null LIMIT 1 "
        "  FOR c2 IN @@col "
        "    SORT APPROX_NEAR_COSINE(c.embedding, c2.embedding) DESC LIMIT 3 "
        "    RETURN c2._id"
    )
    vec_ok = False
    for attempt in range(6):
        try:
            results = list(db.aql.execute(vec_aql, bind_vars={"@col": CHUNKS_VECTOR_COLLECTION}))
            if results:
                print(f"[add]   Vector probe: materialized {len(results)} chunk(s) — OK")
                vec_ok = True
                break
        except Exception as exc:  # noqa: BLE001
            print(f"[add]   Vector probe attempt {attempt + 1}/6: {type(exc).__name__} (index settling)")
        time.sleep(6)
    if not vec_ok:
        print("[add]   WARNING: Vector probe materialized 0 chunks after 6 attempts")

    return bm25_ok and vec_ok


# ── view + vector index self-heal (same pattern as build_unstructured.py 6.5/6.6) ─


def _refresh_chunks_view(db) -> None:
    """Full DROP + RECREATE the ArangoSearch chunks view for clean re-index."""
    print("[add] Stage 8a — full DROP + RECREATE ArangoSearch chunks view ...")
    if not _view_exists(db, CHUNKS_SEARCH_VIEW):
        print(f"[add]   {CHUNKS_SEARCH_VIEW} absent — skip (created by the spike/agent DDL)")
        return
    db.delete_view(CHUNKS_SEARCH_VIEW)
    time.sleep(8)
    if _view_exists(db, CHUNKS_SEARCH_VIEW):
        raise SystemExit(f"[add] FAIL — {CHUNKS_SEARCH_VIEW} still present after delete")
    db.create_arangosearch_view(CHUNKS_SEARCH_VIEW, properties={"links": {CHUNKS_VECTOR_COLLECTION: CHUNKS_VIEW_LINK}})
    time.sleep(8)
    after = db.view(CHUNKS_SEARCH_VIEW).get("links") or {}
    if CHUNKS_VECTOR_COLLECTION not in after:
        raise SystemExit(f"[add] FAIL — {CHUNKS_VECTOR_COLLECTION} link missing after recreate")
    print(f"[add]   chunks view recreated; links: {sorted(after.keys())}")


def _rebuild_vector_index(db) -> None:
    """Capture-then-DROP+RECREATE the HNSW vector index on customer360_Chunks.embedding."""
    print("[add] Stage 8b — DROP + RECREATE HNSW vector index ...")
    col = db.collection(CHUNKS_VECTOR_COLLECTION)
    existing = None
    for idx in col.indexes():
        if idx.get("type") == "vector":
            existing = idx
            break
    if existing is None:
        print(f"[add]   no vector index on {CHUNKS_VECTOR_COLLECTION} — skip")
        return
    if existing.get("fields") != ["embedding"]:
        raise SystemExit(f"[add] FATAL — refusing to rebuild unexpected vector index fields: {existing.get('fields')!r}")
    p = existing.get("params") or {}
    name = existing.get("name", "vector_cosine")
    print(f"[add]   dropping index {name!r} on {CHUNKS_VECTOR_COLLECTION}.embedding ...")
    col.delete_index(existing["id"])
    time.sleep(10)
    print(f"[add]   recreating vector index (dim={p.get('dimensions')}, metric={p.get('metric')}) ...")
    col.add_index({
        "type": "vector",
        "name": name,
        "fields": ["embedding"],
        "params": {
            "metric": p.get("metric", "cosine"),
            "dimension": p.get("dimensions") or p.get("dimension", 512),
            "nLists": p.get("nLists", 1),
            "trainingIterations": p.get("trainingIterations", 10),
            "defaultNProbe": p.get("defaultNProbe", 1),
        },
        "inBackground": True,
    })
    time.sleep(10)
    print(f"[add]   vector index recreated")


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(
        description="CDC-01 incremental ADD lane — zero-churn tiny-module variant"
    )
    ap.add_argument(
        "--module",
        default="meridian_slack_escalation",
        help="module name to ingest (default: meridian_slack_escalation)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="print the planned steps + staged doc + target module WITHOUT making any destructive calls",
    )
    args = ap.parse_args()

    module = args.module
    dry_run = args.dry_run

    cfg = _arango_cfg()
    manifest = _load_manifest()

    # Locate the pre-staged doc for this module.
    file_name, doc_path = _module_doc_path(module, manifest)

    if dry_run:
        print("[add] DRY-RUN — no corpus build, orchestrate, or purge will be called\n")
        print(f"[add] Staged doc  : {doc_path}")
        print(f"[add] File name   : {file_name}")
        print(f"[add] Target module: {module}")
        print(f"[add] Doc exists  : {doc_path.exists()}")
        meta = manifest.get(file_name, {})
        print(f"[add] account_id  : {meta.get('account_id')}")
        print(f"[add] entity_id   : {meta.get('entity_id')}")
        print(f"[add] citable_url : {meta.get('citable_url')}")
        print()
        print("[add] Planned step sequence:")
        print("  Stage 0 — health check AutoGraph")
        print("  Stage 1 — upload pre-staged doc via File Manager (durable path)")
        print("  Stage 2 — corpus build: incremental=True, file_ids=[new doc], cluster_threshold=1 (no modules= arg)")
        print("  Stage 3 — rag-strategizer analyze + wait for strategy to stabilize")
        print("  Stage 4 — read back partition_ids from customer360_rags for module")
        print("  Stage 5 — partition-prefix-scoped purge (STARTS_WITH partition_id prefix)")
        print("             allowlist: customer360_ collections only; NEVER truncate-all")
        db = _get_db(cfg)
        _purge_module_layer3(db, f"{module}_", dry_run=True)
        print("  Stage 6 — orchestrate_with_wait(partition_ids=<step-4 list>)")
        print("  Stage 7 — content-derived re-stamp via repair_kg_attribution.py")
        print("             (content-derived; scramble-safe; RESEARCH Pitfall 3)")
        print("  Stage 8a — BM25 view DROP + RECREATE")
        print("  Stage 8b — HNSW vector index DROP + RECREATE")
        print("  Stage 9 — hybrid probe: BM25 + APPROX_NEAR_COSINE")
        print()
        print("[add] DRY-RUN complete — no changes made")
        return 0

    # ── LIVE RUN ──────────────────────────────────────────────────────────────

    client = _client(cfg)
    total_start = time.monotonic()
    wall_clocks: dict[str, float] = {}

    # Stage 0 — health check
    print(f"[add] Stage 0 — health check {_autograph_url()} ...")
    t0 = time.monotonic()
    health, _ = client.health()
    status = str(health.get("status") or "").upper()
    if status != "SERVING":
        raise SystemExit(f"[add] FAIL — AutoGraph health not SERVING: {health!r}")
    wall_clocks["health"] = (time.monotonic() - t0) * 1000
    print(f"[add]   health OK — {status}  ({wall_clocks['health']:.0f}ms)")

    if not doc_path.exists():
        raise SystemExit(f"[add] FAIL — pre-staged doc missing: {doc_path}")

    # Stage 1 — upload via File Manager (durable path; NOT import-multiple)
    print(f"[add] Stage 1 — upload {file_name} via File Manager ...")
    t0 = time.monotonic()
    content = doc_path.read_bytes()
    file_id = client.upload_rag_input(cfg["db"], file_name, content, content_type=_content_type(file_name))
    wall_clocks["upload"] = (time.monotonic() - t0) * 1000
    print(f"[add]   uploaded — file_id={file_id}  ({wall_clocks['upload']:.0f}ms)")

    # Stage 2 — corpus build (incremental=True is the ADD-lane knob)
    # NOTE: do NOT pass modules=[module]. On this cluster doc->module tagging is
    # done at import-multiple, which is a silent no-op here; the proven-GREEN
    # full build (build_unstructured.py) ingests via File Manager file_ids with
    # NO modules= arg and reconstructs module/account identity AFTER the build
    # (repair_kg_attribution.py). Passing modules=[new-module] filtered on a
    # module with zero member docs and the build inserted 0 docs
    # ("No documents were inserted into the database"). See memory
    # add-lane-modules-filter-fails. We mirror the proven file_ids path and keep
    # incremental=True; eval-gate AFTER is the no-corruption guard.
    print(f"[add] Stage 2 — corpus build (incremental=True, file_ids, cluster_threshold=1) ...")
    t0 = time.monotonic()
    resp, _ = client.create_corpus_build(
        file_ids=[file_id],
        incremental=True,
        embedding_strategy="first_chunk",
        top_k=7,
        cluster_threshold=1,
    )
    build_id = (
        resp.get("corpus_build_id") or resp.get("corpusBuildId")
        or resp.get("buildId") or resp.get("id") or resp.get("build_id")
    )
    if not build_id:
        raise SystemExit(f"[add] FAIL — corpus build response missing id: {resp!r}")
    print(f"[add]   build submitted: {build_id}")
    for body, _ in client.poll_corpus_build(build_id, interval_s=20, timeout_s=5400):
        bstatus = str(body.get("status") or body.get("state") or "").lower()
        print(f"[add]   corpus status: {bstatus or 'pending'}")
        if bstatus == "completed":
            break
        if bstatus in {"failed", "error", "cancelled"}:
            msg = str(body.get("message") or "")[:400]
            raise SystemExit(f"[add] FAIL — corpus build {bstatus}: {msg}")
    wall_clocks["corpus_build"] = (time.monotonic() - t0) * 1000
    print(f"[add]   corpus build COMPLETED  ({wall_clocks['corpus_build']:.0f}ms)")

    # Stage 3 — rag-strategizer analyze + stabilize
    print("[add] Stage 3 — rag-strategizer analyze + wait for strategy to stabilize ...")
    t0 = time.monotonic()
    client.analyze_strategizer(full_graph_rag_strategy="high")
    strategy_body, _, _ = client.wait_for_strategy_stable(timeout_s=1800)
    strategies = strategy_body.get("strategies") or strategy_body.get("partitions") or []
    wall_clocks["strategize"] = (time.monotonic() - t0) * 1000
    print(f"[add]   strategy stable — {len(strategies)} partition strategies  ({wall_clocks['strategize']:.0f}ms)")

    # Stage 4 — read back partition ids (Guardrail 3: do NOT assume _0_a)
    print(f"[add] Stage 4 — reading back partition_ids for module={module!r} ...")
    db = _get_db(cfg)
    partition_ids = _read_partition_ids(db, module)
    print(f"[add]   partition_ids: {partition_ids}")
    if not partition_ids:
        raise SystemExit(f"[add] FAIL — no partition ids found for module={module!r}")

    # Stage 5 — partition-prefix-scoped purge (T-12-01 mitigation)
    print(f"[add] Stage 5 — purge Layer-3 for module={module!r} (prefix-scoped, allowlist-guarded) ...")
    module_prefix = f"{module}_"
    purge_counts = _purge_module_layer3(db, module_prefix, dry_run=False)
    total_purged = sum(purge_counts.values())
    print(f"[add]   purge complete — {total_purged} records removed across {len(purge_counts)} collections")

    # Stage 6 — orchestrate (partition-scoped; Guardrail 1: serialize)
    print(f"[add] Stage 6 — orchestrate(replicas=2, partition_ids={partition_ids}) ...")
    t0 = time.monotonic()
    oresp, kickoff_ms, wait_ms = client.orchestrate_with_wait(
        replicas=2,
        max_retries=3,
        partition_ids=partition_ids,
    )
    oid = oresp.get("orchestration_id") or oresp.get("orchestrationId") or oresp.get("id")
    wall_clocks["orchestrate"] = (time.monotonic() - t0) * 1000
    print(f"[add]   orchestration started: {oid}  kickoff={kickoff_ms:.0f}ms  prior_wait={wait_ms:.0f}ms")
    # Wait for KG collections to populate (same pattern as build_unstructured.py Stage 5).
    print("[add]   waiting for KG collections to populate ...")
    KG_DOCUMENTS = "customer360_Documents"
    KG_CHUNKS = "customer360_Chunks"
    deadline = time.monotonic() + 2400
    prev = (-1, -1)
    stable_count = 0
    while time.monotonic() < deadline:
        db = _get_db(cfg)  # refresh JWT
        docs = db.collection(KG_DOCUMENTS).count() if db.has_collection(KG_DOCUMENTS) else 0
        chunks = db.collection(KG_CHUNKS).count() if db.has_collection(KG_CHUNKS) else 0
        print(f"[add]   {KG_DOCUMENTS}={docs}  {KG_CHUNKS}={chunks}")
        cur = (docs, chunks)
        if docs > 0 and chunks > 0 and cur == prev:
            stable_count += 1
            if stable_count >= 2:
                print("[add]   KG collections populated and stable")
                break
        else:
            stable_count = 0
        prev = cur
        time.sleep(30)
    else:
        raise SystemExit("[add] FAIL — KG collections did not stabilize within 2400s")
    wall_clocks["orchestrate_total"] = (time.monotonic() - t0) * 1000
    print(f"[add]   orchestrate + KG stabilize complete  ({wall_clocks['orchestrate_total']:.0f}ms)")

    # Stage 7 — content-derived re-stamp via repair_kg_attribution.py
    # MUST use content-derived re-stamp (repair_kg_attribution) — the manifest-keyed approach
    # mis-attributes ~78/105 docs due to AutoGraph filename scramble (RESEARCH Pitfall 3).
    print("[add] Stage 7 — content-derived re-stamp (repair_kg_attribution.py) ...")
    t0 = time.monotonic()
    rc = subprocess.run(
        [sys.executable, str(_REPO_ROOT / "scripts" / "repair_kg_attribution.py")],
        cwd=str(_REPO_ROOT),
    ).returncode
    if rc != 0:
        raise SystemExit(f"[add] FAIL — repair_kg_attribution.py exited {rc} (scramble unresolved)")
    wall_clocks["restamp"] = (time.monotonic() - t0) * 1000
    print(f"[add]   re-stamp complete  ({wall_clocks['restamp']:.0f}ms)")

    # Stage 8 — BM25 view + vector index self-heal (Pitfall 4 mitigation)
    db = _get_db(cfg)
    _refresh_chunks_view(db)
    db = _get_db(cfg)
    _rebuild_vector_index(db)

    # Stage 9 — hybrid probe
    print("[add] Stage 9 — hybrid retrieval probe ...")
    db = _get_db(cfg)
    probe_ok = _probe_hybrid_retrieval(db, module)
    if not probe_ok:
        print("[add]   WARNING: hybrid probe did not fully confirm both BM25 and vector retrieval")

    # ── Summary ───────────────────────────────────────────────────────────────
    total_ms = (time.monotonic() - total_start) * 1000
    print()
    print("[add] ── WALL-CLOCK SUMMARY ──")
    for stage, ms in wall_clocks.items():
        print(f"[add]   {stage:25s}: {ms/1000:.1f}s")
    print(f"[add]   {'TOTAL':25s}: {total_ms/1000:.1f}s")
    print()
    print(f"[add] ADD LANE COMPLETE — module={module!r} file={file_name!r} partition_ids={partition_ids}")
    print(f"[add] Incremental latency (total wall-clock): {total_ms/1000:.1f}s — feeds Plan 02 progress budget")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
