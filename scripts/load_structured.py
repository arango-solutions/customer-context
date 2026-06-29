"""
Idempotent structured-graph loader — DDL + UPSERT for all 7 vertex and 7 edge collections.

Loads the hand-modeled customer360_structured graph from Phase 2's 12 structured JSON
files (2 accounts × 6 source files). Creates all vertex/edge collections, registers the
named graph, and loads all records via python-arango UPSERT keyed on entity_id.

Re-running this script produces identical DB state (idempotent) — every UPSERT uses
overwrite_mode="update" so the _key always wins without duplicate errors.

Usage:
  python scripts/load_structured.py              # full load
  python scripts/load_structured.py --dry-run    # validate source files, print counts, no DB write

AQL safety: this script uses python-arango collection.insert() with overwrite semantics
— no AQL string construction is used anywhere. All collection names are module-level
constants (never user inputs). No f-string AQL anywhere in this file.
"""

import argparse
import json
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

# Load .env — override=True is MANDATORY to prevent stale shell env vars
# from shadowing the valid .env values (e.g., stale OPENAI_API_KEY causes 401).
load_dotenv(_REPO_ROOT / ".env", override=True)

# ---------------------------------------------------------------------------
# Source file paths (all under data_gen/output/structured/)
# ---------------------------------------------------------------------------

STRUCTURED_DIR = _REPO_ROOT / "data_gen" / "output" / "structured"

# 18 input files — 6 entity types × 3 accounts (northwind + meridian + helio)
SOURCE_FILES: dict[str, list[str]] = {
    "Account": [
        "northwind/crm/northwind_crm_accounts.json",
        "meridian/crm/meridian_crm_accounts.json",
        "helio/crm/helio_crm_accounts.json",
    ],
    "Contact": [
        "northwind/crm/northwind_crm_contacts.json",
        "meridian/crm/meridian_crm_contacts.json",
        "helio/crm/helio_crm_contacts.json",
    ],
    "Opportunity": [
        "northwind/crm/northwind_crm_opportunities.json",
        "meridian/crm/meridian_crm_opportunities.json",
        "helio/crm/helio_crm_opportunities.json",
    ],
    "NPS": [
        "northwind/crm/northwind_crm_nps.json",
        "meridian/crm/meridian_crm_nps.json",
        "helio/crm/helio_crm_nps.json",
    ],
    "UsageFact": [
        "northwind/snowflake/northwind_snowflake_usage_metrics.json",
        "meridian/snowflake/meridian_snowflake_usage_metrics.json",
        "helio/snowflake/helio_snowflake_usage_metrics.json",
    ],
    "Contract": [
        "northwind/docusign/northwind_docusign_contracts.json",
        "meridian/docusign/meridian_docusign_contracts.json",
        "helio/docusign/helio_docusign_contracts.json",
    ],
}

# ---------------------------------------------------------------------------
# Valid Product _key values (for USES_PRODUCT edge validation — T-03-03-03)
# ---------------------------------------------------------------------------

_VALID_PRODUCTS = {"Community", "Enterprise", "ArangoGraph", "GenAI"}

# ---------------------------------------------------------------------------
# Synthetic Product nodes (not from JSON files)
# ---------------------------------------------------------------------------

_PRODUCT_NODES = [
    {"_key": "product_Community", "name": "Community", "tier": 1},
    {"_key": "product_Enterprise", "name": "Enterprise", "tier": 2},
    {"_key": "product_ArangoGraph", "name": "ArangoGraph", "tier": 3},
    {"_key": "product_GenAI", "name": "GenAI", "tier": 4},
]


# ---------------------------------------------------------------------------
# ArangoDB connection (_get_db)
# ---------------------------------------------------------------------------

def _get_db():
    """
    Connect to the customer360 ArangoDB database using Bearer token auth.

    Auth flow: POST /_open/auth with credentials → extract JWT →
    ArangoClient(hosts=url).db(db_name, user_token=jwt).

    Bearer token is REQUIRED for DDL on the live cluster; basic auth returns
    401 for collection/graph creation. Confirmed in STATE.md accumulation.

    Env var fallback: supports both ARANGO_URL/ARANGO_USER/ARANGO_DB (PATTERNS.md)
    and ARANGO_ENDPOINT/ARANGO_USERNAME/ARANGO_DATABASE (actual .env var names).
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
    # python-arango 8.x uses user_token= (not auth_token=) for Bearer JWT
    return client.db(arango_db, user_token=jwt)


# ---------------------------------------------------------------------------
# DDL helpers
# ---------------------------------------------------------------------------

def _ensure_collection(db, name: str, edge: bool = False) -> None:
    """Create collection if it does not exist. Idempotent."""
    if not db.has_collection(name):
        db.create_collection(name, edge=edge)
        print(f"[load]   Created collection: {name} (edge={edge})")
    else:
        print(f"[load]   Collection already exists: {name}")


def _ensure_graph(db) -> None:
    """Register customer360_structured named graph if not already present. Idempotent."""
    graph_name = "customer360_structured"
    if db.has_graph(graph_name):
        print(f"[load]   Named graph '{graph_name}' already registered")
        return

    edge_definitions = [
        {
            "edge_collection": "HAS_CONTACT",
            "from_vertex_collections": ["Account"],
            "to_vertex_collections": ["Contact"],
        },
        {
            "edge_collection": "HAS_OPPORTUNITY",
            "from_vertex_collections": ["Account"],
            "to_vertex_collections": ["Opportunity"],
        },
        {
            "edge_collection": "HAS_CONTRACT",
            "from_vertex_collections": ["Account"],
            "to_vertex_collections": ["Contract"],
        },
        {
            "edge_collection": "HAS_USAGE",
            "from_vertex_collections": ["Account"],
            "to_vertex_collections": ["UsageFact"],
        },
        {
            "edge_collection": "HAS_NPS",
            "from_vertex_collections": ["Account"],
            "to_vertex_collections": ["NPS"],
        },
        {
            "edge_collection": "CLOSED_AS",
            "from_vertex_collections": ["Opportunity"],
            "to_vertex_collections": ["Contract"],
        },
        {
            "edge_collection": "USES_PRODUCT",
            "from_vertex_collections": ["Account"],
            "to_vertex_collections": ["Product"],
        },
    ]

    db.create_graph(graph_name, edge_definitions=edge_definitions)
    print(f"[load]   Named graph '{graph_name}' created with 7 edge definitions")


# ---------------------------------------------------------------------------
# Data I/O helpers
# ---------------------------------------------------------------------------

def _load_json(path: Path) -> list[dict]:
    """Load a JSON array from path. Raises clearly on missing file."""
    if not path.exists():
        raise FileNotFoundError(f"Source file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _upsert_vertices(
    collection,
    records: list[dict],
    key_field: str = "entity_id",
) -> int:
    """
    UPSERT records into a vertex collection keyed on key_field.

    Each record's _key is set from rec[key_field] before insert.
    overwrite=True + overwrite_mode="update" → idempotent on re-run.
    Returns count of records upserted.
    """
    count = 0
    for rec in records:
        doc = {**rec, "_key": rec[key_field]}
        collection.insert(doc, overwrite=True, overwrite_mode="update")
        count += 1
    return count


def _upsert_edge(
    collection,
    from_id: str,
    to_id: str,
    props: dict | None = None,
) -> None:
    """
    UPSERT a single edge document.

    _key is derived from from_id and to_id (deterministic, idempotent).
    Key truncated to 120 chars to stay within ArangoDB key limits.

    from_id / to_id must be fully-qualified collection/document IDs,
    e.g. "Account/abc123" and "Contact/def456".
    """
    # Deterministic edge _key — idempotent on re-run
    from_key = from_id.split("/")[-1] if "/" in from_id else from_id
    to_key = to_id.split("/")[-1] if "/" in to_id else to_id
    edge_key = f"{from_key}_{to_key}"[:120]

    doc: dict = {"_key": edge_key, "_from": from_id, "_to": to_id}
    if props:
        doc.update(props)

    collection.insert(doc, overwrite=True, overwrite_mode="update")


# ---------------------------------------------------------------------------
# Dry-run helper
# ---------------------------------------------------------------------------

def _dry_run() -> None:
    """Validate all 12 source files exist and print record counts. No DB writes."""
    print("[load] DRY RUN — validating source files (no DB writes)")
    all_ok = True
    total = 0
    for entity_type, paths in SOURCE_FILES.items():
        for rel_path in paths:
            full_path = STRUCTURED_DIR / rel_path
            try:
                records = _load_json(full_path)
                count = len(records)
                total += count
                print(f"[load]   {rel_path}: {count} record(s)")
            except Exception as exc:
                print(f"[load]   ERROR: {rel_path}: {exc}", file=sys.stderr)
                all_ok = False

    print(f"\n[load] --- Dry Run Summary ---")
    print(f"  Source files: {sum(len(v) for v in SOURCE_FILES.values())} (12 expected)")
    print(f"  Total records found: {total}")
    print(f"  Product nodes (synthetic): {len(_PRODUCT_NODES)}")
    if all_ok:
        print(f"[load] DRY RUN PASSED — all source files found")
        sys.exit(0)
    else:
        print(f"[load] DRY RUN FAILED — one or more source files missing or unreadable", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main load logic
# ---------------------------------------------------------------------------

def main(dry_run: bool = False) -> None:
    if dry_run:
        _dry_run()
        return  # _dry_run calls sys.exit() but this guard is explicit

    # ------------------------------------------------------------------ #
    # Stage 0 — Connect                                                   #
    # ------------------------------------------------------------------ #
    print("[load] Stage 0 — Connecting to ArangoDB")
    db = _get_db()
    print("[load]   Connected OK")

    # ------------------------------------------------------------------ #
    # Stage 1 — Ensure collections (7 vertex + 7 edge)                   #
    # ------------------------------------------------------------------ #
    print("[load] Stage 1 — Ensuring vertex collections")
    for coll in ["Account", "Contact", "Opportunity", "Contract",
                 "UsageFact", "NPS", "Product"]:
        _ensure_collection(db, coll, edge=False)

    print("[load] Stage 1 — Ensuring edge collections")
    for coll in ["HAS_CONTACT", "HAS_OPPORTUNITY", "HAS_CONTRACT",
                 "HAS_USAGE", "HAS_NPS", "CLOSED_AS", "USES_PRODUCT"]:
        _ensure_collection(db, coll, edge=True)

    # ------------------------------------------------------------------ #
    # Stage 2 — Register named graph                                      #
    # ------------------------------------------------------------------ #
    print("[load] Stage 2 — Ensuring named graph 'customer360_structured'")
    _ensure_graph(db)

    # ------------------------------------------------------------------ #
    # Stage 3 — Load vertex collections (dependency order)               #
    # ------------------------------------------------------------------ #

    # Accumulate all records for edge derivation later
    all_accounts: list[dict] = []
    all_contacts: list[dict] = []
    all_opportunities: list[dict] = []
    all_contracts: list[dict] = []
    all_usage_facts: list[dict] = []
    all_nps: list[dict] = []

    print("[load] Stage 3 — Loading Account vertices (key=account_id)")
    for rel_path in SOURCE_FILES["Account"]:
        try:
            records = _load_json(STRUCTURED_DIR / rel_path)
            # Account._key comes from account_id (not entity_id — RESEARCH.md Gap 4)
            count = _upsert_vertices(db.collection("Account"), records, key_field="account_id")
            all_accounts.extend(records)
            print(f"[load]   Account: {count} record(s) from {rel_path}")
        except Exception as exc:
            print(f"[load] ERROR loading {rel_path}: {exc}", file=sys.stderr)
            raise

    print("[load] Stage 3 — Loading Contact vertices (key=entity_id)")
    for rel_path in SOURCE_FILES["Contact"]:
        try:
            records = _load_json(STRUCTURED_DIR / rel_path)
            count = _upsert_vertices(db.collection("Contact"), records)
            all_contacts.extend(records)
            print(f"[load]   Contact: {count} record(s) from {rel_path}")
        except Exception as exc:
            print(f"[load] ERROR loading {rel_path}: {exc}", file=sys.stderr)
            raise

    print("[load] Stage 3 — Loading Opportunity vertices (key=entity_id)")
    for rel_path in SOURCE_FILES["Opportunity"]:
        try:
            records = _load_json(STRUCTURED_DIR / rel_path)
            count = _upsert_vertices(db.collection("Opportunity"), records)
            all_opportunities.extend(records)
            print(f"[load]   Opportunity: {count} record(s) from {rel_path}")
        except Exception as exc:
            print(f"[load] ERROR loading {rel_path}: {exc}", file=sys.stderr)
            raise

    print("[load] Stage 3 — Loading Contract vertices (key=entity_id)")
    for rel_path in SOURCE_FILES["Contract"]:
        try:
            records = _load_json(STRUCTURED_DIR / rel_path)
            count = _upsert_vertices(db.collection("Contract"), records)
            all_contracts.extend(records)
            print(f"[load]   Contract: {count} record(s) from {rel_path}")
        except Exception as exc:
            print(f"[load] ERROR loading {rel_path}: {exc}", file=sys.stderr)
            raise

    print("[load] Stage 3 — Loading UsageFact vertices (key=entity_id)")
    for rel_path in SOURCE_FILES["UsageFact"]:
        try:
            records = _load_json(STRUCTURED_DIR / rel_path)
            count = _upsert_vertices(db.collection("UsageFact"), records)
            all_usage_facts.extend(records)
            print(f"[load]   UsageFact: {count} record(s) from {rel_path}")
        except Exception as exc:
            print(f"[load] ERROR loading {rel_path}: {exc}", file=sys.stderr)
            raise

    print("[load] Stage 3 — Loading NPS vertices (key=entity_id)")
    for rel_path in SOURCE_FILES["NPS"]:
        try:
            records = _load_json(STRUCTURED_DIR / rel_path)
            count = _upsert_vertices(db.collection("NPS"), records)
            all_nps.extend(records)
            print(f"[load]   NPS: {count} record(s) from {rel_path}")
        except Exception as exc:
            print(f"[load] ERROR loading {rel_path}: {exc}", file=sys.stderr)
            raise

    print("[load] Stage 3 — Loading Product nodes (synthetic, hardcoded 4 nodes)")
    product_count = _upsert_vertices(db.collection("Product"), _PRODUCT_NODES, key_field="_key")
    print(f"[load]   Product: {product_count} record(s) (hardcoded)")

    # ------------------------------------------------------------------ #
    # Stage 4 — Load edge collections                                     #
    # ------------------------------------------------------------------ #

    print("[load] Stage 4 — Loading HAS_CONTACT edges")
    has_contact_count = 0
    for rec in all_contacts:
        account_id = rec.get("account_id")
        entity_id = rec.get("entity_id")
        if account_id and entity_id:
            _upsert_edge(
                db.collection("HAS_CONTACT"),
                f"Account/{account_id}",
                f"Contact/{entity_id}",
            )
            has_contact_count += 1
    print(f"[load]   HAS_CONTACT: {has_contact_count} edge(s)")

    print("[load] Stage 4 — Loading HAS_OPPORTUNITY edges")
    has_opp_count = 0
    for rec in all_opportunities:
        account_id = rec.get("account_id")
        entity_id = rec.get("entity_id")
        if account_id and entity_id:
            _upsert_edge(
                db.collection("HAS_OPPORTUNITY"),
                f"Account/{account_id}",
                f"Opportunity/{entity_id}",
            )
            has_opp_count += 1
    print(f"[load]   HAS_OPPORTUNITY: {has_opp_count} edge(s)")

    print("[load] Stage 4 — Loading HAS_CONTRACT edges")
    has_contract_count = 0
    for rec in all_contracts:
        account_id = rec.get("account_id")
        entity_id = rec.get("entity_id")
        if account_id and entity_id:
            _upsert_edge(
                db.collection("HAS_CONTRACT"),
                f"Account/{account_id}",
                f"Contract/{entity_id}",
            )
            has_contract_count += 1
    print(f"[load]   HAS_CONTRACT: {has_contract_count} edge(s)")

    print("[load] Stage 4 — Loading HAS_USAGE edges")
    has_usage_count = 0
    for rec in all_usage_facts:
        account_id = rec.get("account_id")
        entity_id = rec.get("entity_id")
        if account_id and entity_id:
            _upsert_edge(
                db.collection("HAS_USAGE"),
                f"Account/{account_id}",
                f"UsageFact/{entity_id}",
            )
            has_usage_count += 1
    print(f"[load]   HAS_USAGE: {has_usage_count} edge(s)")

    print("[load] Stage 4 — Loading HAS_NPS edges")
    has_nps_count = 0
    for rec in all_nps:
        account_id = rec.get("account_id")
        entity_id = rec.get("entity_id")
        if account_id and entity_id:
            _upsert_edge(
                db.collection("HAS_NPS"),
                f"Account/{account_id}",
                f"NPS/{entity_id}",
            )
            has_nps_count += 1
    print(f"[load]   HAS_NPS: {has_nps_count} edge(s)")

    print("[load] Stage 4 — Loading CLOSED_AS edges (Opportunity → Contract)")
    closed_as_count = 0
    skipped_closed_as = 0
    for rec in all_opportunities:
        opp_entity_id = rec.get("entity_id")
        contract_entity_id = rec.get("contract_entity_id")
        if opp_entity_id and contract_entity_id:
            _upsert_edge(
                db.collection("CLOSED_AS"),
                f"Opportunity/{opp_entity_id}",
                f"Contract/{contract_entity_id}",
            )
            closed_as_count += 1
        else:
            skipped_closed_as += 1
    print(f"[load]   CLOSED_AS: {closed_as_count} edge(s) ({skipped_closed_as} skipped — no contract_entity_id)")

    print("[load] Stage 4 — Loading USES_PRODUCT edges (Account → Product)")
    uses_product_count = 0
    skipped_product = 0
    for rec in all_accounts:
        account_id = rec.get("account_id")
        products_contracted = rec.get("products_contracted", []) or []
        for product_name in products_contracted:
            if product_name in _VALID_PRODUCTS:
                _upsert_edge(
                    db.collection("USES_PRODUCT"),
                    f"Account/{account_id}",
                    f"Product/product_{product_name}",
                )
                uses_product_count += 1
            else:
                print(
                    f"[load]   WARNING: unknown product '{product_name}' in account "
                    f"'{account_id}' — skipping USES_PRODUCT edge (T-03-03-03)",
                    file=sys.stderr,
                )
                skipped_product += 1
    print(f"[load]   USES_PRODUCT: {uses_product_count} edge(s) ({skipped_product} skipped — unknown product)")

    # ------------------------------------------------------------------ #
    # Stage 5 — Summary                                                   #
    # ------------------------------------------------------------------ #
    print(f"\n[load] --- Summary ---")
    print(f"  Vertex counts:")
    print(f"    Account:     {db.collection('Account').count()}")
    print(f"    Contact:     {db.collection('Contact').count()}")
    print(f"    Opportunity: {db.collection('Opportunity').count()}")
    print(f"    Contract:    {db.collection('Contract').count()}")
    print(f"    UsageFact:   {db.collection('UsageFact').count()}")
    print(f"    NPS:         {db.collection('NPS').count()}")
    print(f"    Product:     {db.collection('Product').count()}")
    print(f"  Edge counts:")
    print(f"    HAS_CONTACT:     {db.collection('HAS_CONTACT').count()}")
    print(f"    HAS_OPPORTUNITY: {db.collection('HAS_OPPORTUNITY').count()}")
    print(f"    HAS_CONTRACT:    {db.collection('HAS_CONTRACT').count()}")
    print(f"    HAS_USAGE:       {db.collection('HAS_USAGE').count()}")
    print(f"    HAS_NPS:         {db.collection('HAS_NPS').count()}")
    print(f"    CLOSED_AS:       {db.collection('CLOSED_AS').count()}")
    print(f"    USES_PRODUCT:    {db.collection('USES_PRODUCT').count()}")
    print(f"[load] DONE — customer360_structured loaded successfully")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Idempotent structured graph loader — DDL + UPSERT for customer360_structured."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        dest="dry_run",
        help="Validate source files and print record counts without writing to DB.",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
