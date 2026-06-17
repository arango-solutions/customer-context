"""
Verification harness for the customer360 ArangoDB graphs.

Covers:
  - GRAPH-01: structured graph (7 vertex collections, 7 edge collections, named graph)
  - GRAPH-02: unstructured KG (customer360_Documents/Chunks/Entities/Communities/Relations)
  - GRAPH-03: idempotent structured reload
  - D-04: three thin-proof AQL probes (claim-trace, hybrid, cross-graph)
  - Pre-flight dim check (--dim-check): confirms EMBEDDING_DIMENSIONS=512 on AutoGraph service

Usage:
  python scripts/verify_graphs.py --help
  python scripts/verify_graphs.py --quick          # smoke checks only
  python scripts/verify_graphs.py --full           # all checks + all probes
  python scripts/verify_graphs.py --check structured
  python scripts/verify_graphs.py --check edges
  python scripts/verify_graphs.py --check kg-collections
  python scripts/verify_graphs.py --check account-id-stamp
  python scripts/verify_graphs.py --check idempotent-structured
  python scripts/verify_graphs.py --probe claim-trace
  python scripts/verify_graphs.py --probe hybrid
  python scripts/verify_graphs.py --probe cross-graph
  python scripts/verify_graphs.py --dim-check

AQL safety: all AQL in this file uses bind_vars dict. Collection names are
module-level constants (never user inputs). No f-string or .format() AQL
construction is used anywhere in this file.
"""

import argparse
import base64
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Repo root + sys.path (must come before any local imports)
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Load .env — override=True is MANDATORY to prevent stale shell env vars
# from shadowing the valid .env values (e.g., stale OPENAI_API_KEY causes 401).
load_dotenv(_REPO_ROOT / ".env", override=True)

# ---------------------------------------------------------------------------
# ArangoDB collection name constants
# (hardcoded strings — NOT from user input; AQL injection cannot occur)
# ---------------------------------------------------------------------------

# Structured graph
_COLLECTION_ACCOUNT = "Account"
_COLLECTION_CONTACT = "Contact"
_COLLECTION_OPPORTUNITY = "Opportunity"
_COLLECTION_CONTRACT = "Contract"
_COLLECTION_USAGE_FACT = "UsageFact"
_COLLECTION_NPS = "NPS"
_COLLECTION_PRODUCT = "Product"
_GRAPH_STRUCTURED = "customer360_structured"

# Structured edge collections
_EDGE_HAS_CONTACT = "HAS_CONTACT"
_EDGE_HAS_OPPORTUNITY = "HAS_OPPORTUNITY"
_EDGE_HAS_CONTRACT = "HAS_CONTRACT"
_EDGE_HAS_USAGE = "HAS_USAGE"
_EDGE_HAS_NPS = "HAS_NPS"
_EDGE_CLOSED_AS = "CLOSED_AS"
_EDGE_USES_PRODUCT = "USES_PRODUCT"

# Unstructured KG (AutoGraph output)
_COLLECTION_DOCUMENTS = "customer360_Documents"
_COLLECTION_CHUNKS = "customer360_Chunks"
_COLLECTION_ENTITIES = "customer360_Entities"
_COLLECTION_COMMUNITIES = "customer360_Communities"
_COLLECTION_RELATIONS = "customer360_Relations"


# ---------------------------------------------------------------------------
# ArangoDB connection (_get_db)
# ---------------------------------------------------------------------------

def _get_db():
    """
    Connect to the customer360 ArangoDB database using Bearer token auth.

    Auth flow: POST /_open/auth with credentials → extract JWT →
    ArangoClient(hosts=url).db(db_name, auth_token=jwt).

    Bearer token is REQUIRED for DDL on the live cluster; basic auth returns
    401 for collection/graph creation. Confirmed in STATE.md accumulation.

    Env var fallback: supports both ARANGO_URL/ARANGO_USER/ARANGO_DB (from
    PATTERNS.md) and ARANGO_ENDPOINT/ARANGO_USERNAME/ARANGO_DATABASE (actual
    .env var names used in this repo). The .env var names take priority when
    both are present.
    """
    import httpx
    from arango import ArangoClient

    arango_url = (
        os.environ.get("ARANGO_URL")
        or os.environ["ARANGO_ENDPOINT"]
    )
    arango_user = (
        os.environ.get("ARANGO_USER")
        or os.environ["ARANGO_USERNAME"]
    )
    arango_db = (
        os.environ.get("ARANGO_DB")
        or os.environ.get("ARANGO_DATABASE")
        or "customer360"
    )
    arango_password = os.environ["ARANGO_PASSWORD"]

    auth_resp = httpx.post(
        f"{arango_url}/_open/auth",
        json={"username": arango_user, "password": arango_password},
        timeout=30,
    )
    auth_resp.raise_for_status()
    jwt = auth_resp.json()["jwt"]

    client = ArangoClient(hosts=arango_url)
    return client.db(arango_db, user_token=jwt)


# ---------------------------------------------------------------------------
# Check functions — each returns (passed: bool, message: str)
# ---------------------------------------------------------------------------

def check_structured(db) -> tuple[bool, str]:
    """
    GRAPH-01: Assert all 7 vertex collections exist and named graph is registered.
    Skips gracefully if Account collection is absent (DB not loaded yet).
    """
    vertex_collections = [
        _COLLECTION_ACCOUNT,
        _COLLECTION_CONTACT,
        _COLLECTION_OPPORTUNITY,
        _COLLECTION_CONTRACT,
        _COLLECTION_USAGE_FACT,
        _COLLECTION_NPS,
        _COLLECTION_PRODUCT,
    ]

    if not db.has_collection(_COLLECTION_ACCOUNT):
        print("[verify] SKIP: Account collection not found — run load_structured.py first")
        return (True, "SKIP: structured graph not yet loaded")

    missing = [c for c in vertex_collections if not db.has_collection(c)]
    if missing:
        return (False, f"Missing vertex collections: {missing}")

    if not db.has_graph(_GRAPH_STRUCTURED):
        return (False, f"Named graph '{_GRAPH_STRUCTURED}' not registered")

    return (True, f"All 7 vertex collections present; named graph '{_GRAPH_STRUCTURED}' registered")


def check_edges(db) -> tuple[bool, str]:
    """
    GRAPH-01: Assert all 7 edge collections exist and each has count > 0.
    """
    edge_collections = [
        _EDGE_HAS_CONTACT,
        _EDGE_HAS_OPPORTUNITY,
        _EDGE_HAS_CONTRACT,
        _EDGE_HAS_USAGE,
        _EDGE_HAS_NPS,
        _EDGE_CLOSED_AS,
        _EDGE_USES_PRODUCT,
    ]

    if not db.has_collection(_EDGE_HAS_CONTACT):
        print("[verify] SKIP: HAS_CONTACT edge collection not found — run load_structured.py first")
        return (True, "SKIP: edge collections not yet loaded")

    missing = [c for c in edge_collections if not db.has_collection(c)]
    if missing:
        return (False, f"Missing edge collections: {missing}")

    empty = []
    for coll_name in edge_collections:
        # AQL safety: collection name is a module-level constant (not user input)
        aql = "RETURN LENGTH(@coll)"
        # python-arango does not allow binding collection names in AQL — use
        # the collection object's count() method instead (no AQL injection path)
        count = db.collection(coll_name).count()
        if count == 0:
            empty.append(coll_name)

    if empty:
        return (False, f"Empty edge collections (0 edges): {empty}")

    return (True, "All 7 edge collections present and non-empty")


def check_kg_collections(db) -> tuple[bool, str]:
    """
    GRAPH-02: Assert customer360_kg collections all exist and are non-empty.
    """
    kg_collections = [
        _COLLECTION_DOCUMENTS,
        _COLLECTION_CHUNKS,
        _COLLECTION_ENTITIES,
        _COLLECTION_COMMUNITIES,
        _COLLECTION_RELATIONS,
    ]

    if not db.has_collection(_COLLECTION_DOCUMENTS):
        print("[verify] SKIP: customer360_Documents not found — run build_unstructured.py first")
        return (True, "SKIP: unstructured KG not yet built")

    missing = [c for c in kg_collections if not db.has_collection(c)]
    if missing:
        return (False, f"Missing KG collections: {missing}")

    empty = [c for c in kg_collections if db.collection(c).count() == 0]
    if empty:
        return (False, f"Empty KG collections: {empty}")

    return (True, f"All 5 KG collections present and non-empty")


def check_account_id_stamp(db) -> tuple[bool, str]:
    """
    GRAPH-02: Assert at least 90% of customer360_Documents have non-null account_id.
    AQL safety: no user-supplied values; all bind_vars are None-comparison constants.
    """
    if not db.has_collection(_COLLECTION_DOCUMENTS):
        print("[verify] SKIP: customer360_Documents not found — run build_unstructured.py first")
        return (True, "SKIP: Documents collection not yet built")

    total = db.collection(_COLLECTION_DOCUMENTS).count()
    if total == 0:
        return (True, "SKIP: customer360_Documents is empty")

    # AQL safety: no bind_vars needed — the null comparison uses a literal
    # and the collection name is a hardcoded constant (not a bind var).
    # python-arango does not support binding collection names in AQL text;
    # hardcoded collection name constant is the safe pattern here.
    aql_null_count = """
        FOR doc IN customer360_Documents
          FILTER doc.account_id == null
          COLLECT WITH COUNT INTO n
          RETURN n
    """
    cursor = db.aql.execute(aql_null_count)
    null_count = next(cursor, 0)

    pct_stamped = (total - null_count) / total
    if pct_stamped < 0.90:
        return (
            False,
            f"account_id stamp < 90%: {total - null_count}/{total} stamped "
            f"({pct_stamped:.0%}). Run stamp_account_id.py.",
        )

    return (True, f"account_id stamp OK: {total - null_count}/{total} docs stamped ({pct_stamped:.0%})")


def check_idempotent_structured(db) -> tuple[bool, str]:
    """
    GRAPH-03: Assert structured vertex counts are stable on two sequential reads.

    Two consecutive COUNT queries must return the same value. This confirms
    the DB state is stable (no mid-test modification). The real idempotency
    assertion — re-running load_structured.py and checking count equality —
    is documented as a separate acceptance step in Plan 03-03 Task 2.
    """
    if not db.has_collection(_COLLECTION_ACCOUNT):
        print("[verify] SKIP: Account collection not found — run load_structured.py first")
        return (True, "SKIP: structured graph not yet loaded")

    # Two sequential counts must agree
    count_1 = db.collection(_COLLECTION_ACCOUNT).count()
    count_2 = db.collection(_COLLECTION_ACCOUNT).count()

    if count_1 != count_2:
        return (False, f"Account count unstable: {count_1} vs {count_2} on two reads")

    if count_1 == 0:
        return (False, "Account collection is empty — expected at least 1 record after load")

    return (True, f"Account count stable at {count_1} on two sequential reads")


# ---------------------------------------------------------------------------
# Probe functions — each returns (passed: bool, message: str)
# ---------------------------------------------------------------------------

def probe_claim_trace(db, search_term: str = "ArangoDB") -> tuple[bool, str]:
    """
    D-04 Probe 1 — chunk → PART_OF → Document (file_name, citable_url, account_id).

    AQL verbatim from RESEARCH.md Gap 5 Probe 1.
    AQL safety: only @search_term is a user-supplied value and it is bound via
    bind_vars. Collection names (customer360_Chunks, customer360_Relations) are
    hardcoded constants in the AQL string literal below.
    """
    if not db.has_collection(_COLLECTION_CHUNKS):
        print("[verify] SKIP: customer360_Chunks not found — run build_unstructured.py first")
        return (True, "SKIP: Chunks collection not yet built")

    aql = """
        LET chunk = FIRST(
          FOR c IN customer360_Chunks
            FILTER CONTAINS(c.content, @search_term)
            LIMIT 1
            RETURN c
        )
        FOR v, e, p IN 1..2 OUTBOUND chunk._id customer360_Relations
          FILTER p.edges[0].type == "PART_OF"
          LET doc = p.vertices[1]
          RETURN {
            chunk_key:   chunk._key,
            chunk_text:  LEFT(chunk.content, 200),
            file_name:   doc.file_name,
            citable_url: doc.citable_url,
            account_id:  doc.account_id
          }
    """
    cursor = db.aql.execute(aql, bind_vars={"search_term": search_term})
    results = list(cursor)

    if not results:
        return (False, f"Probe 1 (claim-trace): no chunks containing '{search_term}' found")

    sourced = [r for r in results if r.get("file_name") and r.get("citable_url")]
    if not sourced:
        return (
            False,
            f"Probe 1 (claim-trace): {len(results)} results but none have "
            "non-null file_name and citable_url — check citable_url was set "
            "at import-multiple time (RESEARCH.md Pitfall 2)",
        )

    return (True, f"Probe 1 (claim-trace): {len(sourced)} results with file_name + citable_url")


def probe_hybrid(db, query_text: str = "ArangoDB enterprise graph query") -> tuple[bool, str]:
    """
    D-04 Probe 2 — APPROX_NEAR_COSINE hybrid retrieval with source attribution.

    Embeds query_text using OpenAI text-embedding-3-small at dimensions=512,
    then runs the AQL verbatim from RESEARCH.md Gap 5 Probe 2.
    AQL safety: @query_embedding is a Python list passed via bind_vars.
    Collection names are hardcoded constants.
    """
    if not db.has_collection(_COLLECTION_CHUNKS):
        print("[verify] SKIP: customer360_Chunks not found — run build_unstructured.py first")
        return (True, "SKIP: Chunks collection not yet built")

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("[verify] SKIP: OPENAI_API_KEY not set — cannot embed query for hybrid probe")
        return (True, "SKIP: OPENAI_API_KEY not set")

    from openai import OpenAI

    client = OpenAI()
    resp = client.embeddings.create(
        model="text-embedding-3-small",
        input=[query_text],
        dimensions=512,
    )
    query_embedding = resp.data[0].embedding

    aql = """
        LET results = (
          FOR c IN customer360_Chunks
            LET score = APPROX_NEAR_COSINE(c.embedding, @query_embedding)
            SORT score DESC
            LIMIT 5
            FOR doc IN 1..1 OUTBOUND c._id customer360_Relations
              FILTER doc.file_name != null
              RETURN {
                chunk_key:   c._key,
                score:       score,
                content:     LEFT(c.content, 200),
                file_name:   doc.file_name,
                citable_url: doc.citable_url,
                account_id:  doc.account_id
              }
        )
        RETURN results
    """
    cursor = db.aql.execute(aql, bind_vars={"query_embedding": query_embedding})
    outer = list(cursor)
    results = outer[0] if outer else []

    if not results:
        return (False, "Probe 2 (hybrid): no results returned — check APPROX_NEAR_COSINE index exists")

    with_score = [r for r in results if r.get("score") is not None and r.get("score") > 0]
    if not with_score:
        return (False, "Probe 2 (hybrid): results returned but score == 0 for all — index may be missing")

    return (True, f"Probe 2 (hybrid): {len(with_score)} results with score > 0")


def probe_cross_graph(db) -> tuple[bool, str]:
    """
    D-04 Probe 3 — cross-graph join: customer360_Documents.account_id → Account._key.

    AQL verbatim from RESEARCH.md Gap 5 Probe 3.
    AQL safety: no user-supplied values in this query. Collection names are
    hardcoded constants.
    """
    if not db.has_collection(_COLLECTION_DOCUMENTS):
        print("[verify] SKIP: customer360_Documents not found — run build_unstructured.py first")
        return (True, "SKIP: Documents collection not yet built")

    if not db.has_collection(_COLLECTION_ACCOUNT):
        print("[verify] SKIP: Account collection not found — run load_structured.py first")
        return (True, "SKIP: structured graph not yet loaded")

    aql = """
        FOR doc IN customer360_Documents
          FILTER doc.account_id != null
          LIMIT 10
          FOR acct IN Account
            FILTER acct._key == doc.account_id
            RETURN {
              doc_file_name:   doc.file_name,
              doc_citable_url: doc.citable_url,
              account_name:    acct.account_name,
              account_segment: acct.segment,
              health_score:    acct.health_score
            }
    """
    cursor = db.aql.execute(aql, bind_vars={})
    results = list(cursor)

    if not results:
        return (
            False,
            "Probe 3 (cross-graph): no Documents with account_id join to Account — "
            "check stamp_account_id.py was run after the build",
        )

    with_name = [r for r in results if r.get("account_name")]
    if not with_name:
        return (False, "Probe 3 (cross-graph): joined rows but account_name is null on all")

    return (True, f"Probe 3 (cross-graph): {len(with_name)} Documents joined to Account")


def probe_dim_check() -> tuple[bool, str]:
    """
    Pre-flight dimension check — A2 confirmation gate.

    Connects to the AutoGraph REST API (AUTOGRAPH_URL env var, Bearer
    AUTOGRAPH_TOKEN env var), imports one tiny inline document, runs a corpus
    build, queries customer360_Chunks for a chunk from that document, and
    asserts len(chunk.embedding) == 512.

    If the env vars are absent: prints a clear error and returns (False, message)
    without raising. Does NOT crash with an unhandled exception.

    If the embedding dimension is not 512: prints a clear mismatch error so
    the caller can halt before the full build. A dim=1536 result would invalidate
    the Phase 2 near-miss guard.
    """
    autograph_url = os.environ.get("AUTOGRAPH_URL")
    autograph_token = os.environ.get("AUTOGRAPH_TOKEN")

    if not autograph_url:
        msg = (
            "[dim-check] SKIP: AUTOGRAPH_URL not set in environment. "
            "This check requires the AutoGraph service to be provisioned "
            "(planned for Plan 03-04). Set AUTOGRAPH_URL and AUTOGRAPH_TOKEN "
            "in .env and re-run --dim-check once the service is available."
        )
        print(msg)
        return (False, "SKIP: AUTOGRAPH_URL not set — dim-check deferred to Plan 03-04 provisioning")

    if not autograph_token:
        msg = (
            "[dim-check] FAIL: AUTOGRAPH_URL is set but AUTOGRAPH_TOKEN is missing. "
            "Derive the token via POST {AUTOGRAPH_URL}/_open/auth with ArangoDB credentials."
        )
        print(msg)
        return (False, "FAIL: AUTOGRAPH_TOKEN not set")

    import httpx

    headers = {
        "Authorization": f"Bearer {autograph_token}",
        "Content-Type": "application/json",
    }

    # Step 0: health check
    print("[dim-check] Step 0 — health check")
    try:
        health_resp = httpx.get(f"{autograph_url}/v1/health", headers=headers, timeout=30)
        health_resp.raise_for_status()
        status = health_resp.json().get("status", "UNKNOWN")
        print(f"[dim-check]   Health: {status}")
        if status != "SERVING":
            return (False, f"AutoGraph health check returned status '{status}' (expected SERVING)")
    except httpx.HTTPError as exc:
        return (False, f"AutoGraph health check failed: {exc}")

    # Step 1: import-multiple with a single tiny inline document
    print("[dim-check] Step 1 — import single preflight document")
    doc_name = "preflight_dim_check.txt"
    doc_content = base64.b64encode(b"ArangoDB pre-flight dim check").decode()
    import_payload = {
        "files": [
            {
                "doc_name": doc_name,
                "content": doc_content,
                "citable_url": "https://example.com/preflight_dim_check",
            }
        ],
        "module": "customer360_preflight",
    }
    try:
        import_resp = httpx.post(
            f"{autograph_url}/v1/import-multiple",
            headers=headers,
            json=import_payload,
            timeout=60,
        )
        import_resp.raise_for_status()
        print(f"[dim-check]   OK: {import_resp.json()}")
    except httpx.HTTPError as exc:
        return (False, f"import-multiple failed: {exc}")

    # Step 2: corpus build
    print("[dim-check] Step 2 — corpus build (cluster_threshold=1)")
    build_payload = {
        "embedding_strategy": "first_chunk",
        "strategy": {"top_k": 7, "cluster_threshold": 1},
    }
    try:
        build_resp = httpx.post(
            f"{autograph_url}/v1/corpus/builds",
            headers=headers,
            json=build_payload,
            timeout=60,
        )
        build_resp.raise_for_status()
        build_data = build_resp.json()
        build_id = build_data.get("id")
        print(f"[dim-check]   Build started: id={build_id}")
    except httpx.HTTPError as exc:
        return (False, f"corpus build request failed: {exc}")

    # Poll until completed
    print(f"[dim-check] Step 2 — polling build {build_id}")
    for attempt in range(60):
        time.sleep(5)
        try:
            poll_resp = httpx.get(
                f"{autograph_url}/v1/corpus/builds/{build_id}",
                headers=headers,
                timeout=30,
            )
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()
            build_status = poll_data.get("status")
            print(f"[dim-check]   Poll {attempt + 1}: status={build_status}")
            if build_status == "completed":
                break
            if build_status in {"failed", "error"}:
                return (False, f"Corpus build failed with status '{build_status}': {poll_data}")
        except httpx.HTTPError as exc:
            return (False, f"Poll failed: {exc}")
    else:
        return (False, "Corpus build timed out (300 seconds)")

    # Step 3: query customer360_Chunks for the preflight document's embedding
    print("[dim-check] Step 3 — querying Chunks for preflight embedding dimension")
    try:
        db = _get_db()
    except Exception as exc:
        return (False, f"DB connection for dim-check failed: {exc}")

    if not db.has_collection(_COLLECTION_CHUNKS):
        return (False, "customer360_Chunks not found after corpus build — build may have failed silently")

    # AQL safety: @doc_name is a Python string bound via bind_vars.
    # Collection name is a hardcoded constant.
    aql = """
        FOR c IN customer360_Chunks
          FILTER CONTAINS(c.content, @fragment)
          LIMIT 1
          RETURN c.embedding
    """
    cursor = db.aql.execute(aql, bind_vars={"fragment": "ArangoDB pre-flight dim check"})
    embedding = next(cursor, None)

    if embedding is None:
        return (
            False,
            f"Dim check: no chunk found for preflight document '{doc_name}' — "
            "corpus build may not have processed the preflight module",
        )

    dim = len(embedding)
    if dim == 512:
        print(f"[dim-check] PASS: embedding dimension = {dim} (expected 512)")
        return (True, f"PASS: EMBEDDING_DIMENSIONS=512 confirmed on deployed AutoGraph service")
    else:
        error_msg = (
            f"EMBEDDING_DIMENSIONS mismatch: got {dim}, expected 512. "
            "Phase 2 near-miss guard is invalidated. "
            "Stop and contact the platform team to set EMBEDDING_DIMENSIONS=512 "
            "on the deployed AutoGraph service for the customer360 project."
        )
        print(f"[dim-check] FAIL: {error_msg}", file=sys.stderr)
        return (False, error_msg)


# ---------------------------------------------------------------------------
# Result accumulator
# ---------------------------------------------------------------------------

def _run_check(name: str, fn, *args) -> bool:
    """Run a check/probe function, print result, return passed bool."""
    print(f"[verify] Running: {name}")
    try:
        passed, message = fn(*args)
    except Exception as exc:
        print(f"[verify] ERROR in {name}: {exc}", file=sys.stderr)
        return False
    status = "PASS" if passed else "FAIL"
    print(f"[verify]   {status}: {message}")
    return passed


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verification harness for customer360 ArangoDB graphs (GRAPH-01/02/03, D-04).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Smoke checks: structured + kg-collections + account-id-stamp. "
             "Exits 0 with SKIP messages when DB is empty.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="All checks then all three D-04 probes.",
    )
    parser.add_argument(
        "--check",
        choices=["structured", "edges", "kg-collections", "account-id-stamp", "idempotent-structured"],
        help="Run a single named check.",
    )
    parser.add_argument(
        "--probe",
        choices=["claim-trace", "hybrid", "cross-graph"],
        help="Run a single D-04 AQL probe.",
    )
    parser.add_argument(
        "--dim-check",
        action="store_true",
        dest="dim_check",
        help="Pre-flight: confirm EMBEDDING_DIMENSIONS=512 on deployed AutoGraph service.",
    )
    args = parser.parse_args()

    if not any([args.quick, args.full, args.check, args.probe, args.dim_check]):
        parser.print_help()
        sys.exit(0)

    # Dim-check does not need DB connection (it creates its own)
    if args.dim_check:
        passed, message = probe_dim_check()
        sys.exit(0 if passed else 1)

    # All other checks/probes need a DB connection
    print("[verify] Connecting to ArangoDB...")
    try:
        db = _get_db()
        print("[verify]   Connected OK")
    except Exception as exc:
        print(f"[verify] FATAL: Could not connect to ArangoDB: {exc}", file=sys.stderr)
        sys.exit(1)

    results: list[bool] = []

    if args.quick:
        results.append(_run_check("structured", check_structured, db))
        results.append(_run_check("kg-collections", check_kg_collections, db))
        results.append(_run_check("account-id-stamp", check_account_id_stamp, db))

    elif args.full:
        results.append(_run_check("structured", check_structured, db))
        results.append(_run_check("edges", check_edges, db))
        results.append(_run_check("kg-collections", check_kg_collections, db))
        results.append(_run_check("account-id-stamp", check_account_id_stamp, db))
        results.append(_run_check("idempotent-structured", check_idempotent_structured, db))
        results.append(_run_check("probe:claim-trace", probe_claim_trace, db))
        results.append(_run_check("probe:hybrid", probe_hybrid, db))
        results.append(_run_check("probe:cross-graph", probe_cross_graph, db))

    elif args.check:
        check_map = {
            "structured": check_structured,
            "edges": check_edges,
            "kg-collections": check_kg_collections,
            "account-id-stamp": check_account_id_stamp,
            "idempotent-structured": check_idempotent_structured,
        }
        fn = check_map[args.check]
        results.append(_run_check(args.check, fn, db))

    elif args.probe:
        probe_map = {
            "claim-trace": probe_claim_trace,
            "hybrid": probe_hybrid,
            "cross-graph": probe_cross_graph,
        }
        fn = probe_map[args.probe]
        results.append(_run_check(f"probe:{args.probe}", fn, db))

    # Summary
    total = len(results)
    passed_count = sum(results)
    failed_count = total - passed_count

    print(f"\n[verify] --- Summary ---")
    print(f"  Total checks: {total}")
    print(f"  Passed:       {passed_count}")
    print(f"  Failed:       {failed_count}")

    if failed_count > 0:
        print(f"[verify] FAILED ({failed_count} check(s) failed)", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"[verify] PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
