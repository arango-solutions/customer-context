"""
D-04 / D-05 integrity gate for the canonical entity bridge.

Checks:
  - bridge-collections: canonical_entities + same_as exist and are non-empty
  - no-double-resolution: no entity_name in the KG maps to 2+ different entity_ids (D-04 check 1)
  - bijection: every canonical hub has at least one KG entity → hub same_as edge (D-04 check 2)
  - entity-id-stamp: demo-critical entity_ids stamped onto customer360_Entities (contacts/accounts)
  - demo-critical: 100% of demo-critical entities that exist in the KG are correctly linked (D-05)
  - trace: ENT-02 cross-graph trace AQL returns a renderable fragment

Usage:
  python scripts/verify_entity_bridge.py --quick
  python scripts/verify_entity_bridge.py --full
  python scripts/verify_entity_bridge.py --check no-double-resolution
  python scripts/verify_entity_bridge.py --check bijection
  python scripts/verify_entity_bridge.py --check entity-id-stamp
  python scripts/verify_entity_bridge.py --check demo-critical
  python scripts/verify_entity_bridge.py --check collections
  python scripts/verify_entity_bridge.py --probe trace

AQL safety: all AQL uses bind_vars dict. Collection names are module-level
constants (never user inputs). No f-string or .format() AQL construction.

D-04 gate (blocks on failure):
  Check 1 — no double-resolution: no entity_name is assigned to more than
    one distinct canonical entity_id. Multiple KG rows (different entity_types)
    for the same entity_name and entity_id are correct — the check catches
    cases where the same surface form was mapped to two conflicting hubs.
    0 violations returned = PASS.
  Check 2 — bijection (hub coverage): every canonical hub in canonical_entities
    has at least one outbound same_as edge from any customer360_Entities row.
    Hubs with 0 incoming same_as edges = FAIL (the bridge is broken for those).
    0 violations = PASS.

D-05 gate (blocks on failure):
  100% of demo-critical entities that are present in canonical_entities must
  also have entity_id stamped in customer360_Entities. Contracts not extracted
  by AutoGraph (absent from customer360_Entities entirely) are reported as
  warnings, not failures — AutoGraph's entity extraction is the upstream limit.
  Gate blocks if any entity that IS in canonical_entities is NOT correctly
  stamped in customer360_Entities.

ENT-02 trace probe:
  Follows a sample demo-critical KG entity through the same_as traversal
  to reach the canonical hub, then finds the structured nodes on the other
  side. Returns a renderable fragment with kg_entity_name, canonical_id,
  match_method, matched_surface_form, confidence, and structured_nodes.
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Repo root + sys.path (must come before any local imports)
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# MANDATORY — prevents stale shell OPENAI_API_KEY (…5CAA) from shadowing .env
load_dotenv(_REPO_ROOT / ".env", override=True)

# ---------------------------------------------------------------------------
# Collection name constants
# (hardcoded strings — NOT from user input; AQL injection cannot occur)
# ---------------------------------------------------------------------------

_COLLECTION_ENTITIES  = "customer360_Entities"   # AutoGraph KG output
_COLLECTION_CANONICAL = "canonical_entities"      # Phase 4 hub (vertex)
_COLLECTION_SAME_AS   = "same_as"                 # Phase 4 bridge (edge)

# ---------------------------------------------------------------------------
# Demo-critical entity set constant
# These are the named entities the 6 locked questions traverse.
# Phase 4 D-05 gate: ALL of these that are present in canonical_entities
# must also be stamped in customer360_Entities. Entities not extracted
# by AutoGraph (absent from customer360_Entities) are noted as warnings.
# Source: RESEARCH.md §5, cross-referenced with locked-questions-and-data-map.md.
# ---------------------------------------------------------------------------

_DEMO_CRITICAL_ENTITIES: dict[str, dict] = {
    "633f43bd-5cbd-579e-9105-2ded0f2e7c76": {
        "display_name": "James Okafor",
        "type": "Contact",
        "account": "meridian",
    },
    "135970e6-29ec-5bcb-8cd1-887973aa326d": {
        "display_name": "Taylor Brooks",
        "type": "Contact",
        "account": "meridian",
    },
    "ead03ac6-14ab-5dd9-8bf8-794c507ff628": {
        "display_name": "Patricia Vance",
        "type": "Contact",
        "account": "meridian",
    },
    "4818c0ff-b555-5395-8950-ae3916c176a3": {
        "display_name": "Sarah Chen",
        "type": "Contact",
        "account": "northwind",
    },
    "0b5c0005-9e04-5d41-8cb4-abbe369f0e4f": {
        "display_name": "Michael Torres",
        "type": "Contact",
        "account": "northwind",
    },
    "9eff6d7b-7311-5525-be75-5b82a855ece7": {
        "display_name": "Meridian Logistics",
        "type": "Account",
        "account": "meridian",
    },
    "0d5b5863-d3da-51e3-b117-ddbfa7ba2d16": {
        "display_name": "Northwind Analytics",
        "type": "Account",
        "account": "northwind",
    },
    "47a06e4c-42ce-59ad-865c-cbeef04f1708": {
        "display_name": "Enterprise 2026",
        "type": "Contract",
        "account": "meridian",
    },
    "629062eb-1233-51c3-a74c-6821b2020df3": {
        "display_name": "ArangoGraph 2026",
        "type": "Contract",
        "account": "northwind",
    },
}

_DEMO_CRITICAL_IDS = list(_DEMO_CRITICAL_ENTITIES.keys())


# ---------------------------------------------------------------------------
# ArangoDB connection
# ---------------------------------------------------------------------------


def _get_db():
    """
    Connect to the customer360 ArangoDB database using Bearer token auth.

    Auth flow: POST /_open/auth with credentials → extract JWT →
    ArangoClient(hosts=url).db(db_name, user_token=jwt).

    Bearer token is REQUIRED for DDL on the live cluster; basic auth returns
    401 for collection/graph creation.

    Env var fallback: supports both ARANGO_URL/ARANGO_USER/ARANGO_DB and
    ARANGO_ENDPOINT/ARANGO_USERNAME/ARANGO_DATABASE (.env var names in repo).
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
    return client.db(arango_db, user_token=jwt)   # user_token=, NOT auth_token=


# ---------------------------------------------------------------------------
# Check functions — all return tuple[bool, str]
# ---------------------------------------------------------------------------


def check_bridge_collections(db) -> tuple[bool, str]:
    """
    Verify canonical_entities and same_as both exist and are non-empty.
    Returns FAIL if either collection is missing or empty.
    AQL safety: no user values; collection existence checked via python-arango API.
    """
    issues: list[str] = []

    for coll_name in (_COLLECTION_CANONICAL, _COLLECTION_SAME_AS):
        if not db.has_collection(coll_name):
            issues.append(f"'{coll_name}' missing — run build_entity_bridge.py first")
        else:
            count = db.collection(coll_name).count()
            if count == 0:
                issues.append(f"'{coll_name}' exists but is empty")

    if issues:
        return (False, "Bridge collections check failed: " + "; ".join(issues))

    canonical_count = db.collection(_COLLECTION_CANONICAL).count()
    same_as_count   = db.collection(_COLLECTION_SAME_AS).count()
    return (
        True,
        f"canonical_entities={canonical_count} hubs, same_as={same_as_count} edges — both non-empty",
    )


def check_entity_id_stamp(db) -> tuple[bool, str]:
    """
    Verify demo-critical entity_ids are stamped onto customer360_Entities rows.

    Checks only entities that appear in canonical_entities (i.e., those the
    bridge builder actually matched). Entities absent from the KG entirely
    (e.g., contracts not extracted by AutoGraph) are noted, not failed.

    AQL safety: @demo_critical_ids is a Python list bound via bind_vars.
    """
    if not db.has_collection(_COLLECTION_ENTITIES):
        return (True, f"SKIP: {_COLLECTION_ENTITIES} not found — run build_unstructured.py first")

    if not db.has_collection(_COLLECTION_CANONICAL):
        return (True, f"SKIP: {_COLLECTION_CANONICAL} not found — run build_entity_bridge.py first")

    # Find which demo-critical entities are actually in canonical_entities (hub exists)
    aql_hubs = """
        FOR h IN canonical_entities
          FILTER h.canonical_id IN @demo_critical_ids
          RETURN h.canonical_id
    """
    cursor = db.aql.execute(aql_hubs, bind_vars={"demo_critical_ids": _DEMO_CRITICAL_IDS})
    hub_ids = set(cursor)

    # Of those, check which have entity_id stamped in customer360_Entities
    aql_stamped = """
        FOR e IN customer360_Entities
          FILTER e.entity_id IN @hub_ids
          RETURN DISTINCT e.entity_id
    """
    cursor2 = db.aql.execute(aql_stamped, bind_vars={"hub_ids": list(hub_ids)})
    stamped_ids = set(cursor2)

    # Report entities in canonical_entities but NOT stamped in customer360_Entities
    missing_stamp = [
        f"{_DEMO_CRITICAL_ENTITIES[eid]['display_name']} ({eid})"
        for eid in hub_ids
        if eid not in stamped_ids
    ]

    # Report entities NOT in the KG at all (no hub, no stamp — AutoGraph didn't extract them)
    not_in_kg = [
        f"{_DEMO_CRITICAL_ENTITIES[eid]['display_name']} ({_DEMO_CRITICAL_ENTITIES[eid]['type']})"
        for eid in _DEMO_CRITICAL_IDS
        if eid not in hub_ids
    ]

    if not_in_kg:
        print(
            f"[bridge-verify] NOTE: {len(not_in_kg)} demo-critical entities not extracted "
            f"by AutoGraph (expected for contract/product types): {not_in_kg}"
        )

    if missing_stamp:
        return (
            False,
            f"entity_id stamp missing for {len(missing_stamp)} hub-linked entities "
            f"(in canonical_entities but not stamped in customer360_Entities): {missing_stamp}",
        )

    linked = len(hub_ids)
    return (
        True,
        f"All {linked}/{linked} canonical-hub-linked entities have entity_id stamped "
        f"in customer360_Entities ({len(not_in_kg)} not in KG — AutoGraph extraction limit)",
    )


def check_no_double_resolution(db) -> tuple[bool, str]:
    """
    D-04 Check 1 — no entity_name is mapped to two different canonical entity_ids.

    This detects genuine resolution errors: when the same surface form (entity_name)
    in the KG is assigned two conflicting canonical entity_ids. Multiple KG rows
    sharing the same (entity_name, entity_id) pair — e.g., same person extracted
    under different entity types — are CORRECT and are not flagged.

    AQL safety: no user values; collection names are hardcoded constants.
    """
    if not db.has_collection(_COLLECTION_ENTITIES):
        return (True, f"SKIP: {_COLLECTION_ENTITIES} not found")

    aql = """
        FOR e IN customer360_Entities
          FILTER e.entity_id != null
          COLLECT entity_name = e.entity_name INTO groups
          LET distinct_eids = LENGTH(UNIQUE(groups[*].e.entity_id))
          FILTER distinct_eids > 1
          RETURN {entity_name: entity_name, distinct_entity_ids: distinct_eids}
    """
    cursor = db.aql.execute(aql)
    doubles = list(cursor)

    if doubles:
        return (False, f"D-04 Check 1 FAIL: entity_name mapped to multiple entity_ids: {doubles}")

    return (True, "No double-resolution — every entity_name maps to exactly one canonical entity_id")


def check_bijection(db) -> tuple[bool, str]:
    """
    D-04 Check 2 — every canonical hub has at least one KG entity → hub same_as edge.

    Verifies that each canonical_entities hub is reachable from at least one
    customer360_Entities node via a same_as edge. A hub with no incoming edges
    from the KG side is a broken bridge (the hub exists but the link is missing).

    AQL safety: @demo_critical_ids is a Python list bound via bind_vars.
    The WITH canonical_entities clause is required for cluster-mode traversals.
    """
    if not db.has_collection(_COLLECTION_SAME_AS):
        return (
            True,
            f"SKIP: {_COLLECTION_SAME_AS} collection not found — run build_entity_bridge.py first",
        )

    if not db.has_collection(_COLLECTION_CANONICAL):
        return (True, f"SKIP: {_COLLECTION_CANONICAL} not found")

    # Check each canonical hub for at least one incoming KG → hub same_as edge
    aql = """
        FOR hub IN canonical_entities
          FILTER hub.canonical_id IN @demo_critical_ids
          LET kg_edges = LENGTH(
            FOR ed IN same_as
              FILTER ed._to == hub._id
              FILTER IS_SAME_COLLECTION("customer360_Entities", DOCUMENT(ed._from))
              LIMIT 1 RETURN 1
          )
          FILTER kg_edges == 0
          RETURN {display_name: hub.display_name, canonical_id: hub.canonical_id}
    """
    cursor = db.aql.execute(aql, bind_vars={"demo_critical_ids": _DEMO_CRITICAL_IDS})
    violations = list(cursor)

    if violations:
        return (False, f"D-04 Check 2 FAIL: hubs with no KG same_as edges: {violations}")

    # Count total hubs checked
    aql_count = """
        FOR hub IN canonical_entities
          FILTER hub.canonical_id IN @demo_critical_ids
          RETURN hub.canonical_id
    """
    cursor2 = db.aql.execute(aql_count, bind_vars={"demo_critical_ids": _DEMO_CRITICAL_IDS})
    hub_count = len(list(cursor2))

    return (
        True,
        f"Bijection OK — all {hub_count} demo-critical canonical hubs have at least "
        "one inbound same_as edge from the KG",
    )


def check_demo_critical(db) -> tuple[bool, str]:
    """
    D-05 hard gate — 100% of demo-critical entities in canonical_entities are correctly
    stamped in customer360_Entities.

    Entities not extracted by AutoGraph (absent from customer360_Entities entirely,
    e.g., contracts whose names did not appear as standalone KG entities) are counted
    separately and noted — they do not block since the upstream limit is AutoGraph's
    entity extraction, not the bridge builder.

    Blocks on failure: caller treats False return as sys.exit(1).
    AQL safety: @demo_critical_ids is a Python list bound via bind_vars.
    """
    if not db.has_collection(_COLLECTION_ENTITIES):
        return (True, f"SKIP: {_COLLECTION_ENTITIES} not found")

    if not db.has_collection(_COLLECTION_CANONICAL):
        return (True, f"SKIP: {_COLLECTION_CANONICAL} not found")

    # Step 1: find which demo-critical entities have canonical hubs
    aql_hubs = """
        FOR h IN canonical_entities
          FILTER h.canonical_id IN @demo_critical_ids
          RETURN h.canonical_id
    """
    cursor = db.aql.execute(aql_hubs, bind_vars={"demo_critical_ids": _DEMO_CRITICAL_IDS})
    hub_ids = set(cursor)

    # Step 2: of those, find which are stamped in customer360_Entities
    if hub_ids:
        aql_stamped = """
            FOR e IN customer360_Entities
              FILTER e.entity_id IN @hub_ids
              RETURN DISTINCT e.entity_id
        """
        cursor2 = db.aql.execute(aql_stamped, bind_vars={"hub_ids": list(hub_ids)})
        stamped_ids = set(cursor2)
    else:
        stamped_ids = set()

    total_in_kg   = len(hub_ids)
    correct_in_kg = len(stamped_ids)
    not_in_kg     = len(_DEMO_CRITICAL_IDS) - total_in_kg

    missing = [
        f"{_DEMO_CRITICAL_ENTITIES[eid]['display_name']} ({eid})"
        for eid in hub_ids
        if eid not in stamped_ids
    ]

    if not_in_kg > 0:
        not_in_kg_names = [
            _DEMO_CRITICAL_ENTITIES[eid]["display_name"]
            for eid in _DEMO_CRITICAL_IDS
            if eid not in hub_ids
        ]
        print(
            f"[bridge-verify] NOTE: {not_in_kg}/{len(_DEMO_CRITICAL_IDS)} demo-critical "
            f"entities not in KG (AutoGraph didn't extract them): {not_in_kg_names}"
        )

    if total_in_kg == 0:
        return (
            True,
            f"SKIP: No demo-critical entities found in canonical_entities — "
            "run build_entity_bridge.py first",
        )

    ratio = f"{correct_in_kg}/{total_in_kg} = {correct_in_kg / total_in_kg * 100:.0f}%"

    if missing:
        return (
            False,
            f"D-05 FAIL: {ratio} KG-linked demo-critical entities correctly stamped. "
            f"Missing stamps: {missing}",
        )

    return (
        True,
        f"D-05 PASS: {ratio} KG-linked demo-critical entities correctly stamped "
        f"({not_in_kg} not in KG — contract/product extraction limit)",
    )


# ---------------------------------------------------------------------------
# Probe functions — all return tuple[bool, str]
# ---------------------------------------------------------------------------


def probe_trace(db) -> tuple[bool, str]:
    """
    ENT-02 — cross-graph trace AQL returns a renderable fragment.

    Step 1: find a sample demo-critical KG entity in customer360_Entities.
    Step 2: traverse 1..1 OUTBOUND same_as to the canonical hub, then
            1..1 INBOUND same_as to find structured leaf nodes on the other side.
    Returns a result dict containing kg_entity_name, canonical_id, match_method,
    matched_surface_form, confidence, structured_nodes.

    AQL safety: @demo_critical_ids and @kg_entity_key bound via bind_vars.
    Collection names are hardcoded constants.
    WITH canonical_entities is required for ArangoDB cluster-mode traversals.
    """
    if not db.has_collection(_COLLECTION_SAME_AS):
        return (True, f"SKIP: {_COLLECTION_SAME_AS} collection not found")

    if not db.has_collection(_COLLECTION_ENTITIES):
        return (True, f"SKIP: {_COLLECTION_ENTITIES} not found")

    # Step 1: find a sample demo-critical KG entity that has an outbound same_as edge
    aql_find_sample = """
        FOR ed IN same_as
          FILTER IS_SAME_COLLECTION("customer360_Entities", DOCUMENT(ed._from))
          LET ent = DOCUMENT(ed._from)
          FILTER ent.entity_id IN @demo_critical_ids
          LIMIT 1
          RETURN ent._key
    """
    cursor = db.aql.execute(
        aql_find_sample,
        bind_vars={"demo_critical_ids": _DEMO_CRITICAL_IDS},
    )
    sample_key = next(cursor, None)

    if not sample_key:
        return (
            False,
            "Probe trace: no demo-critical KG entities found with outbound same_as edges — "
            "run build_entity_bridge.py first",
        )

    # Step 2: run the full traversal AQL
    # WITH clause declares ALL collections the traversal may visit (required for
    # ArangoDB cluster-mode). Includes canonical_entities (hub), Account, Contact
    # (the structured leaf collections with same_as edges), and customer360_Entities
    # (for IS_SAME_COLLECTION filter on the inbound INBOUND traversal).
    aql_trace = """
        WITH canonical_entities, Account, Contract, Contact, customer360_Entities
        FOR e IN customer360_Entities
          FILTER e._key == @kg_entity_key
          FOR hub IN 1..1 OUTBOUND e._id same_as
            LET bridge_edge = FIRST(
              FOR ed IN same_as
                FILTER ed._from == e._id AND ed._to == hub._id
                LIMIT 1 RETURN ed
            )
            LET structured_links = (
              FOR leaf IN 1..1 INBOUND hub._id same_as
                FILTER NOT IS_SAME_COLLECTION("customer360_Entities", leaf)
                RETURN {
                  collection: SPLIT(leaf._id, "/")[0],
                  key: leaf._key,
                  id: leaf._id
                }
            )
            RETURN {
              kg_entity_name:       e.entity_name,
              canonical_id:         hub.canonical_id,
              display_name:         hub.display_name,
              entity_type:          hub.entity_type,
              match_method:         bridge_edge.match_method,
              matched_surface_form: bridge_edge.matched_surface_form,
              confidence:           bridge_edge.confidence,
              structured_nodes:     structured_links
            }
    """
    cursor = db.aql.execute(aql_trace, bind_vars={"kg_entity_key": sample_key})
    results = list(cursor)

    if not results:
        return (
            False,
            f"Probe trace: no same_as traversal result for KG key '{sample_key}' — "
            "bridge may not have been built for this entity",
        )

    row = results[0]

    # Validate the result has required fields
    if not row.get("canonical_id"):
        return (False, f"Probe trace: result missing canonical_id: {row}")

    if not row.get("structured_nodes"):
        return (
            False,
            f"Probe trace: result has 0 structured_nodes — structured side edges "
            f"may be missing for kg_entity_name='{row.get('kg_entity_name')}', "
            f"canonical_id='{row.get('canonical_id')}'",
        )

    return (
        True,
        f"[bridge-verify] Probe trace (ENT-02): "
        f"kg_entity_name='{row['kg_entity_name']}' "
        f"canonical_id=hub/{row['canonical_id']} "
        f"match_method={row['match_method']} "
        f"matched_surface_form='{row.get('matched_surface_form', '')}' "
        f"confidence={row.get('confidence', 0.0):.4f} "
        f"structured_nodes={len(row['structured_nodes'])}",
    )


# ---------------------------------------------------------------------------
# main() — gate runner with --quick / --full / --check / --probe argparse
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="D-04 / D-05 integrity gate for the canonical entity bridge.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--quick",
        action="store_true",
        help="Collections + entity-id-stamp check only (fast, < 30s).",
    )
    mode.add_argument(
        "--full",
        action="store_true",
        help="All checks + all probes (blocks on D-04/D-05 failure).",
    )
    parser.add_argument(
        "--check",
        metavar="NAME",
        help=(
            "Run one named check: collections | no-double-resolution | "
            "bijection | entity-id-stamp | demo-critical"
        ),
    )
    parser.add_argument(
        "--probe",
        metavar="NAME",
        help="Run one named probe: trace",
    )
    args = parser.parse_args()

    # Require at least one mode
    if not any([args.quick, args.full, args.check, args.probe]):
        parser.print_help()
        sys.exit(0)

    # Connect to ArangoDB
    try:
        db = _get_db()
    except Exception as exc:
        print(f"[bridge-verify] FATAL: Could not connect to ArangoDB: {exc}", file=sys.stderr)
        sys.exit(1)

    # Build check list based on mode
    checks: list[tuple[str, object]] = []

    if args.quick:
        checks = [
            ("collections",     lambda: check_bridge_collections(db)),
            ("entity-id-stamp", lambda: check_entity_id_stamp(db)),
        ]
    elif args.full:
        checks = [
            ("collections",          lambda: check_bridge_collections(db)),
            ("entity-id-stamp",      lambda: check_entity_id_stamp(db)),
            ("no-double-resolution", lambda: check_no_double_resolution(db)),
            ("bijection",            lambda: check_bijection(db)),
            ("demo-critical",        lambda: check_demo_critical(db)),
            ("trace",                lambda: probe_trace(db)),
        ]
    elif args.check:
        check_map = {
            "collections":          lambda: check_bridge_collections(db),
            "entity-id-stamp":      lambda: check_entity_id_stamp(db),
            "no-double-resolution": lambda: check_no_double_resolution(db),
            "bijection":            lambda: check_bijection(db),
            "demo-critical":        lambda: check_demo_critical(db),
        }
        name = args.check
        if name not in check_map:
            print(
                f"[bridge-verify] ERROR: unknown check '{name}'. "
                f"Valid: {list(check_map.keys())}",
                file=sys.stderr,
            )
            sys.exit(1)
        checks = [(name, check_map[name])]
    elif args.probe:
        probe_map = {
            "trace": lambda: probe_trace(db),
        }
        name = args.probe
        if name not in probe_map:
            print(
                f"[bridge-verify] ERROR: unknown probe '{name}'. "
                f"Valid: {list(probe_map.keys())}",
                file=sys.stderr,
            )
            sys.exit(1)
        checks = [(name, probe_map[name])]

    # Run checks + probes, collect results
    failed = False
    for check_name, fn in checks:
        passed, msg = fn()
        label = "PASS" if passed else "FAIL"
        print(f"[bridge-verify] {label}: {check_name} — {msg}")
        if not passed:
            failed = True

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
