"""Plan 03-04 — AutoGraph unstructured KG build for customer360 (GRAPH-02, GRAPH-03 unstructured side).

Drives the full AutoGraph pipeline against the provisioned customer360 512-dim
service (service_discovery.json: customer360_autograph_url):

  Stage 0 — health check (/v1/health → SERVING)
  Stage 1 — File Manager upload of ALL manifest docs (txt/md/pdf) → file_ids
            (POST /_platform/filemanager/_db/{db}/rag-input — the durable path;
             import-multiple silently no-ops on this cluster, see health360 D-13/D-14)
  Stage 2 — corpus build from file_ids (poll to completed)
  Stage 3 — rag-strategizer analyze + wait for strategy to stabilize
  Stage 3.5 — delete-first: truncate the 5 Layer-3 derived collections
            (Documents/Chunks/Entities/Relations/Communities) so a full rebuild
            writes fresh into empty collections instead of appending onto the prior
            build (spike UPDATE-PIPELINE.md line 77). Guarded to that allowlist only;
            NEVER touches the structured graph. Skip with --no-truncate.
  Stage 4 — orchestrate (kickoff; allows one at a time, retries on 409)
  Stage 5 — wait for KG collections (customer360_Documents/Chunks) to populate
  Stage 6.5 — full DROP + RECREATE of customer360_chunks_search_view so the BM25
            inverted index re-indexes cleanly against the fresh chunks the
            delete-first rebuild produced — otherwise stale pre-truncate _ids fail to
            materialize and every hybrid retrieval path throws. A link-only refresh
            leaves orphaned segments on lagging DBserver replicas; the full drop
            discards every backing segment across ALL replicas. Guarded to that one
            view only (recreated with the proven text_en chunks link); NEVER touches
            any other view or the structured graph.
  Stage 6 — dim check: a sampled chunk.embedding has length 512 (A2 gate)
  Stage 7 — stamp citable_url onto customer360_Documents (Pitfall 2 fix;
            account_id/entity_id stamping is Plan 03-05's stamp_account_id.py)

Auth: bearer JWT derived at runtime from {ARANGO_URL}/_open/auth (re-auth on 401).
No static AUTOGRAPH_TOKEN is used.

Resumability: --build-id <id> skips upload+submit and resumes polling/strategize/
orchestrate for an existing build. --skip-stamp / --skip-orchestrate for partial runs.

Usage:
    python scripts/build_unstructured.py                 # full pipeline
    python scripts/build_unstructured.py --build-id X    # resume from an existing build
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
load_dotenv(_REPO_ROOT / ".env", override=True)  # override=True mandatory (stale-shell guard)

from arango import ArangoClient  # noqa: E402
from lib.autograph_client import AutographClient, AutographError  # noqa: E402

_MANIFEST = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_UNSTRUCTURED = _REPO_ROOT / "data_gen" / "output" / "unstructured"
_DISCOVERY = _REPO_ROOT / "service_discovery.json"
_BUILD_MANIFEST = _REPO_ROOT / "build_manifest.json"

KG_DOCUMENTS = "customer360_Documents"
KG_CHUNKS = "customer360_Chunks"
EXPECTED_DIM = 512

# ArangoSearch BM25 view over Chunks.content. The delete-first Layer-3 truncate
# (Stage 3.5) clears customer360_Chunks; orchestrate re-inserts fresh chunks with
# NEW _ids, but this view's inverted index still references the pre-truncate _ids ->
# BM25 ranks stale _ids that no longer materialize (AQL NotFound [MaterializeNode]),
# breaking every hybrid retrieval path. Stage 6.5 below FULL-DROPS + RECREATES ONLY
# this view to force a clean re-index over the fresh chunks across ALL replicas. NEVER
# touches any other view, link, analyzer, or the structured graph.
# NOTE (09-03): the BM25 view is one of TWO indexes carrying orphaned segments after a
# delete-first rebuild; the HNSW *vector* index on customer360_Chunks.embedding
# (index "vector_cosine", APPROX_NEAR_COSINE) has the same orphaned-segment problem and
# must ALSO be dropped+recreated for the hybrid path to fully self-heal. That vector-index
# rebuild was NOT yet authorized for the shared prod cluster — see 09-03-SUMMARY Blocker.
CHUNKS_SEARCH_VIEW = "customer360_chunks_search_view"
# Proven link config (matches agent/test/hybridSpike.test.ts::ensureChunksView).
CHUNKS_VIEW_LINK = {"fields": {"content": {"analyzers": ["text_en"]}}, "includeAllFields": False}

# The 5 AutoGraph-derived Layer-3 collections. These are the ONLY collections this
# script is ever permitted to truncate. The structured hand-modeled graph
# (Account/Contact/Opportunity/UsageFact/Contract/NPS + edges) is NEVER in this set.
# Delete-first sidesteps the importer's additive-vs-wipe ambiguity (spike
# UPDATE-PIPELINE.md line 77): purging Layer-3 before re-orchestrating means it
# doesn't matter whether the importer appends or replaces — it writes fresh into
# empty collections. Without this, a full Option-A rebuild APPENDS onto the prior
# build's docs (244 = 105 stale + 139 new), scrambling Stage-7 attribution.
KG_LAYER3_COLLECTIONS = (
    "customer360_Documents",
    "customer360_Chunks",
    "customer360_Entities",
    "customer360_Relations",
    "customer360_Communities",
)


# ── env / connections ───────────────────────────────────────────────────────


def _arango_cfg() -> dict:
    url = os.environ.get("ARANGO_URL") or os.environ["ARANGO_ENDPOINT"]
    user = os.environ.get("ARANGO_USER") or os.environ["ARANGO_USERNAME"]
    password = os.environ["ARANGO_PASSWORD"]
    db = os.environ.get("ARANGO_DB") or os.environ.get("ARANGO_DATABASE") or "customer360"
    return {"url": url.rstrip("/"), "user": user, "password": password, "db": db}


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
    return {"pdf": "application/pdf", "md": "text/markdown", "txt": "text/plain"}.get(
        ext, mimetypes.guess_type(name)[0] or "application/octet-stream"
    )


def _load_manifest() -> dict:
    return json.loads(_MANIFEST.read_text(encoding="utf-8"))


def _update_build_manifest(**kw) -> None:
    existing = {}
    if _BUILD_MANIFEST.exists():
        try:
            existing = json.loads(_BUILD_MANIFEST.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    existing.update(kw)
    _BUILD_MANIFEST.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")


# ── stages ──────────────────────────────────────────────────────────────────


def stage_upload(client: AutographClient, cfg: dict, manifest: dict, modules: list[str] | None) -> list[str]:
    print(f"[build] Stage 1 — File Manager upload (db={cfg['db']}) ...")
    entries = [
        (k, v) for k, v in manifest.items()
        if (modules is None or v.get("module") in modules)
    ]
    file_ids: list[str] = []
    missing: list[str] = []
    for i, (file_name, meta) in enumerate(entries, start=1):
        path = _UNSTRUCTURED / meta.get("module", "") / file_name
        if not path.exists():
            missing.append(str(path))
            continue
        fid = client.upload_rag_input(
            cfg["db"], file_name, path.read_bytes(), content_type=_content_type(file_name)
        )
        file_ids.append(fid)
        if i % 20 == 0 or i == len(entries):
            print(f"[build]   uploaded {i}/{len(entries)}")
    if missing:
        raise SystemExit(f"[build] FAIL — {len(missing)} manifest files missing on disk: {missing[:5]}")
    print(f"[build] Stage 1 complete — {len(file_ids)} files registered in File Manager")
    return file_ids


def stage_corpus_build(client: AutographClient, file_ids: list[str]) -> str:
    print("[build] Stage 2 — corpus build (file_ids, incremental=False) ...")
    resp, _ = client.create_corpus_build(
        file_ids=file_ids,
        embedding_strategy="first_chunk",
        top_k=7,
        cluster_threshold=1,
        incremental=False,
    )
    build_id = (
        resp.get("corpus_build_id") or resp.get("corpusBuildId")
        or resp.get("buildId") or resp.get("id") or resp.get("build_id")
    )
    if not build_id:
        raise SystemExit(f"[build] FAIL — corpus build response missing id: {resp!r}")
    print(f"[build]   corpus build submitted: {build_id}")
    _update_build_manifest(corpus_build_id=build_id, corpus_build_status="submitted")
    return build_id


def poll_corpus(client: AutographClient, build_id: str) -> None:
    print(f"[build] Stage 2 — polling corpus build {build_id} ...")
    for body, _ in client.poll_corpus_build(build_id, interval_s=20, timeout_s=5400):
        status = str(body.get("status") or body.get("state") or "").lower()
        print(f"[build]   corpus status: {status or 'pending'}")
        if status == "completed":
            _update_build_manifest(corpus_build_status="completed")
            print("[build]   corpus build COMPLETED")
            return
        if status in {"failed", "error", "cancelled"}:
            msg = str(body.get("message") or "")[:400]
            raise SystemExit(f"[build] FAIL — corpus build {status}: {msg}")


def stage_strategize(client: AutographClient) -> None:
    print("[build] Stage 3 — rag-strategizer analyze (full_graph_rag_strategy=high) ...")
    client.analyze_strategizer(full_graph_rag_strategy="high")
    print("[build]   waiting for strategy to stabilize (cap 1800s) ...")
    body, _, _ = client.wait_for_strategy_stable(timeout_s=1800)
    strategies = body.get("strategies") or body.get("partitions") or []
    print(f"[build]   strategy stable — {len(strategies)} partition strategies")
    _update_build_manifest(strategy_partitions=len(strategies))


def stage_truncate_layer3(cfg: dict) -> dict[str, int]:
    """Delete-first: truncate ONLY the 5 AutoGraph Layer-3 derived collections before
    orchestrate, so a full rebuild writes fresh into empty collections instead of
    appending onto a prior build (spike UPDATE-PIPELINE.md line 77).

    Guard: this function operates over the hardcoded KG_LAYER3_COLLECTIONS allowlist
    ONLY. It can never touch the structured graph. As a defence-in-depth assertion we
    re-verify every name carries the customer360_ KG prefix and is in the allowlist
    before issuing a single truncate.
    """
    print("[build] Stage 3.5 — delete-first: truncate Layer-3 derived collections ...")
    # Defence-in-depth: refuse to run if anything outside the explicit allowlist
    # somehow appears (structured collections have no 'customer360_' KG prefix).
    for name in KG_LAYER3_COLLECTIONS:
        if name not in KG_LAYER3_COLLECTIONS or not name.startswith("customer360_"):
            raise SystemExit(f"[build] FATAL — refusing to truncate non-Layer-3 collection: {name!r}")
    db = _get_db(cfg)
    truncated: dict[str, int] = {}
    for name in KG_LAYER3_COLLECTIONS:
        if not db.has_collection(name):
            print(f"[build]   {name}: absent (skip)")
            truncated[name] = 0
            continue
        before = db.collection(name).count()
        db.collection(name).truncate()
        after = db.collection(name).count()
        if after != 0:
            raise SystemExit(f"[build] FAIL — {name} not empty after truncate (count={after})")
        print(f"[build]   {name}: truncated {before} -> 0")
        truncated[name] = before
    print(f"[build]   Layer-3 cleared — {sum(truncated.values())} stale records removed")
    _update_build_manifest(layer3_truncated=truncated)
    return truncated


def stage_orchestrate(client: AutographClient) -> None:
    print("[build] Stage 4 — orchestrate (replicas=2, max_retries=3) ...")
    resp, _, _ = client.orchestrate_with_wait(replicas=2, max_retries=3)
    oid = resp.get("orchestration_id") or resp.get("orchestrationId") or resp.get("id")
    print(f"[build]   orchestrate kicked off: {oid}")
    _update_build_manifest(orchestration_id=oid, orchestrate_status="started")


def wait_for_kg(cfg: dict, *, timeout_s: int = 2400, interval_s: int = 30) -> dict:
    print("[build] Stage 5 — waiting for KG collections to populate ...")
    db = _get_db(cfg)
    deadline = time.monotonic() + timeout_s
    prev = (-1, -1)
    stable = 0
    while time.monotonic() < deadline:
        db = _get_db(cfg)  # fresh JWT each poll (long run > token TTL)
        docs = db.collection(KG_DOCUMENTS).count() if db.has_collection(KG_DOCUMENTS) else 0
        chunks = db.collection(KG_CHUNKS).count() if db.has_collection(KG_CHUNKS) else 0
        print(f"[build]   {KG_DOCUMENTS}={docs}  {KG_CHUNKS}={chunks}")
        cur = (docs, chunks)
        if docs > 0 and chunks > 0 and cur == prev:
            stable += 1
            if stable >= 2:
                print("[build]   KG collections populated and stable")
                return {"documents": docs, "chunks": chunks}
        else:
            stable = 0
        prev = cur
        time.sleep(interval_s)
    raise SystemExit(f"[build] FAIL — KG collections not populated within {timeout_s}s")


def _view_exists(db, name: str) -> bool:
    return any((v.get("name") == name) for v in db.views())


def stage_refresh_chunks_view(cfg: dict) -> None:
    """Stage 6.5 — full DROP + RECREATE of the ArangoSearch chunks view AFTER orchestrate
    so the BM25 inverted index re-indexes cleanly against the fresh chunks the
    delete-first rebuild produced.

    Why full drop+recreate (not link-only drop+re-add): the delete-first Layer-3
    truncate clears customer360_Chunks and orchestrate re-inserts fresh chunks with NEW
    _ids. A link-only refresh re-indexes the view on the replicas the applier reaches,
    but a lagging DBserver replica can retain an ORPHANED index segment holding a
    pre-truncate _id -> intermittent `failed to materialize document ... NotFound
    [MaterializeNode]` on the query path that pins to that replica. Dropping the WHOLE
    view discards every backing index segment across ALL replicas; recreate builds a
    fresh inverted index over the current 139 chunks only. (User-authorized 09-03:
    "Full view drop + recreate".)

    Scope guard: this stage drops + recreates the single view CHUNKS_SEARCH_VIEW
    (customer360_chunks_search_view) ONLY, with the captured/proven link config
    (= agent/test/hybridSpike.test.ts::ensureChunksView: chunks link,
    fields.content.analyzers=['text_en'], includeAllFields:false; empty primary_sort /
    stored_values). It never touches any other view, link, analyzer, or the structured
    graph. If the view is absent (fresh cluster before the spike DDL has run), it skips
    with a notice — creating the view is the spike/agent's job, not the build's.
    """
    print("[build] Stage 6.5 — full DROP + RECREATE ArangoSearch chunks view (clean re-index, clears orphaned segments) ...")
    db = _get_db(cfg)
    if not _view_exists(db, CHUNKS_SEARCH_VIEW):
        print(f"[build]   {CHUNKS_SEARCH_VIEW} absent — skip (created by the spike/agent DDL, not the build)")
        return
    props = db.view(CHUNKS_SEARCH_VIEW)
    links_before = sorted((props.get("links") or {}).keys())
    print(f"[build]   captured {CHUNKS_SEARCH_VIEW} links: {links_before}")
    # 1. FULL DROP — discards every backing index segment across ALL replicas.
    db.delete_view(CHUNKS_SEARCH_VIEW)
    time.sleep(8)  # settle DDL propagation across coordinators/DBservers
    if _view_exists(db, CHUNKS_SEARCH_VIEW):
        raise SystemExit(f"[build] FAIL — {CHUNKS_SEARCH_VIEW} still present after delete")
    print("[build]   view dropped (all backing segments discarded)")
    # 2. RECREATE with the proven captured config -> fresh inverted index over current chunks.
    db.create_arangosearch_view(CHUNKS_SEARCH_VIEW, properties={"links": {KG_CHUNKS: CHUNKS_VIEW_LINK}})
    time.sleep(8)
    after = (db.view(CHUNKS_SEARCH_VIEW).get("links") or {})
    if KG_CHUNKS not in after:
        raise SystemExit(f"[build] FAIL — {KG_CHUNKS} link missing after recreate: {sorted(after.keys())}")
    print(f"[build]   view recreated; links: {sorted(after.keys())}")
    # 3. BM25 probe: materialize >=1 live chunk (a stale index throws NotFound).
    aql = (
        "FOR c IN @@view "
        "  SEARCH ANALYZER(c.content IN TOKENS(@q, 'text_en'), 'text_en') "
        "  SORT BM25(c) DESC LIMIT 3 RETURN c._id"
    )
    live: list[str] = []
    for attempt in range(12):
        try:
            live = [x for x in db.aql.execute(aql, bind_vars={"@view": CHUNKS_SEARCH_VIEW, "q": "renewal escalation churn risk"}) if x]
            if live:
                break
        except Exception as exc:  # noqa: BLE001
            print(f"[build]   probe attempt {attempt + 1}/12: {type(exc).__name__} (re-index settling)")
        time.sleep(6)
    if not live:
        raise SystemExit("[build] FAIL — chunks view BM25 probe materialized 0 live chunks after recreate")
    print(f"[build]   view re-indexed — BM25 materialized {len(live)} live chunk(s)")
    _update_build_manifest(chunks_view_recreated=True, chunks_view_live_probe=len(live))


def stage_dim_check(cfg: dict) -> int:
    print("[build] Stage 6 — embedding dimension check (expect 512) ...")
    db = _get_db(cfg)
    cur = db.aql.execute(
        "FOR c IN @@col FILTER c.embedding != null LIMIT 1 RETURN LENGTH(c.embedding)",
        bind_vars={"@col": KG_CHUNKS},
    )
    dims = list(cur)
    if not dims:
        raise SystemExit("[build] FAIL — no chunk with an embedding found for dim check")
    dim = dims[0]
    if dim != EXPECTED_DIM:
        raise SystemExit(
            f"[build] FAIL — EMBEDDING_DIMENSIONS mismatch: got {dim}, expected {EXPECTED_DIM}. "
            "Phase 2 near-miss guard is invalidated."
        )
    print(f"[build]   dim check PASS — embedding length = {dim}")
    return dim


def stage_stamp_citable_url(cfg: dict, manifest: dict) -> int:
    """Stamp citable_url onto customer360_Documents (Pitfall 2). account_id/entity_id
    is Plan 03-05's job — this only closes the 03-04 citable_url must_have."""
    print("[build] Stage 7 — stamping citable_url onto Documents ...")
    mapping = {
        k: v.get("citable_url", "")
        for k, v in manifest.items()
        if v.get("citable_url")
    }
    db = _get_db(cfg)
    aql = (
        "FOR doc IN @@col "
        "  FILTER HAS(@mapping, doc.file_name) "
        "  UPDATE doc WITH { citable_url: @mapping[doc.file_name] } IN @@col "
        "  RETURN 1"
    )
    cur = db.aql.execute(aql, bind_vars={"@col": KG_DOCUMENTS, "mapping": mapping})
    n = len(list(cur))
    print(f"[build]   stamped citable_url on {n} documents")
    return n


# ── main ────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description="customer360 AutoGraph unstructured KG build")
    ap.add_argument("--build-id", help="resume from an existing corpus build id (skips upload+submit)")
    ap.add_argument("--modules", nargs="*", help="restrict to specific modules")
    ap.add_argument("--skip-orchestrate", action="store_true", help="stop after strategizer")
    ap.add_argument("--skip-stamp", action="store_true", help="skip citable_url stamp")
    ap.add_argument(
        "--no-truncate",
        action="store_true",
        help="skip the delete-first Layer-3 truncate (default: truncate before orchestrate for a clean rebuild)",
    )
    args = ap.parse_args()

    cfg = _arango_cfg()
    manifest = _load_manifest()
    client = _client(cfg)

    print(f"[build] Stage 0 — health check {_autograph_url()} ...")
    health, _ = client.health()
    status = str(health.get("status") or "").upper()
    if status != "SERVING":
        raise SystemExit(f"[build] FAIL — AutoGraph health not SERVING: {health!r}")
    print(f"[build]   health OK — {status}")

    if args.build_id:
        build_id = args.build_id
        print(f"[build] resuming from corpus build {build_id} (skipping upload+submit)")
    else:
        file_ids = stage_upload(client, cfg, manifest, args.modules)
        build_id = stage_corpus_build(client, file_ids)

    poll_corpus(client, build_id)
    stage_strategize(client)

    if args.skip_orchestrate:
        print("[build] --skip-orchestrate set — stopping after strategizer")
        return 0

    # Delete-first: clear stale Layer-3 BEFORE orchestrate so the rebuild is genuinely
    # clean (the importer appends; without this, prior-build docs persist). Skippable
    # via --no-truncate only for diagnostic resumes that must preserve existing Layer-3.
    if not args.no_truncate:
        stage_truncate_layer3(cfg)
    else:
        print("[build] --no-truncate set — skipping Layer-3 delete-first (existing docs preserved)")

    stage_orchestrate(client)
    counts = wait_for_kg(cfg)
    # Stage 6.5 — the delete-first rebuild gave the chunks NEW _ids; the BM25 view's
    # inverted index still references the pre-truncate _ids. Full DROP+RECREATE the view
    # to re-index cleanly across ALL replicas (a link-only refresh leaves orphaned
    # segments on a lagging replica -> NotFound on stale _ids on the pinned query path).
    stage_refresh_chunks_view(cfg)
    dim = stage_dim_check(cfg)
    # Stage 7 — content-derived attribution repair (NOT manifest-keyed-by-file_name).
    # AutoGraph desyncs Document.file_name from content on this service (a permutation),
    # so file_name/account_id/citable_url MUST be re-derived from each doc's own content.
    # See scripts/repair_kg_attribution.py + memory autograph-filename-scramble.
    stamped = 0
    if not args.skip_stamp:
        import subprocess
        print("[build] Stage 7 — content-derived attribution repair ...")
        rc = subprocess.run(
            [sys.executable, str(_REPO_ROOT / "scripts" / "repair_kg_attribution.py")],
            cwd=str(_REPO_ROOT),
        ).returncode
        if rc != 0:
            raise SystemExit("[build] FAIL — attribution repair did not pass (scramble unresolved)")
        stamped = counts["documents"]

    _update_build_manifest(
        orchestrate_status="completed",
        kg_documents=counts["documents"],
        kg_chunks=counts["chunks"],
        embedding_dim=dim,
        citable_url_stamped=stamped,
    )
    print(
        f"[build] DONE — Documents={counts['documents']} Chunks={counts['chunks']} "
        f"dim={dim} citable_url_stamped={stamped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
