"""
Offline ETL that builds the canonical entity bridge between both graphs.

Reads structured JSON and manifest.json to construct a deterministic alias
dictionary, then matches AutoGraph-extracted customer360_Entities against it.
Unmatched entities are optionally compared via offline cosine similarity against
canonical name embeddings (the 'embedding-residual' pass).

For every matched entity the script UPSERTs:
  - A hub document into canonical_entities (vertex, _key = entity_id)
  - A same_as edge from the KG Entities node to the hub
  - A same_as edge from every structured-graph leaf (Contact/Account/Contract)
    carrying that entity_id to the hub

Finally it stamps the entity_id field onto matched customer360_Entities rows
so verify_coref_eval.py can measure accuracy.

Usage:
  python scripts/build_entity_bridge.py
  python scripts/build_entity_bridge.py --dry-run
  python scripts/build_entity_bridge.py --alias-only   # skip embedding step

AQL safety:
  All AQL values passed through bind_vars. Collection names are hardcoded
  module-level constants — never derived from user input or manifest keys.
  No f-string or .format() AQL body construction anywhere in this file.
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Repo root + sys.path (must come before any local imports)
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# MANDATORY — prevents stale shell OPENAI_API_KEY (…5CAA) from shadowing .env
load_dotenv(_REPO_ROOT / ".env", override=True)

# Demo-critical 9-id set — single source of truth (IN-03 closed). The builder's
# embedding-residual fallback needs id -> display_name for the canonical map.
from scripts.demo_critical import DEMO_CRITICAL_ENTITIES  # noqa: E402

# ---------------------------------------------------------------------------
# Collection name constants
# (hardcoded strings — NOT from user input; AQL injection cannot occur)
# ---------------------------------------------------------------------------

_COLLECTION_ENTITIES  = "customer360_Entities"   # AutoGraph KG output
_COLLECTION_CANONICAL = "canonical_entities"      # Phase 4 hub (vertex)
_COLLECTION_SAME_AS   = "same_as"                 # Phase 4 bridge (edge)

# Structured graph leaf collections (sources for same_as edges)
_COLLECTION_ACCOUNT  = "Account"
_COLLECTION_CONTACT  = "Contact"
_COLLECTION_CONTRACT = "Contract"
_COLLECTION_PRODUCT  = "Product"

# ---------------------------------------------------------------------------
# Path constants
# ---------------------------------------------------------------------------

_MANIFEST_PATH  = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_STRUCTURED_DIR = _REPO_ROOT / "data_gen" / "output" / "structured"

# ---------------------------------------------------------------------------
# Matching / embedding constants
# ---------------------------------------------------------------------------

# Entity types to resolve from the KG (D-01: 6-question entity set only).
# AutoGraph Entities outside this set stay unlinked — NOT an error.
# Types are lowercase as stored by AutoGraph in the customer360 corpus.
# Extended set covers aliases AutoGraph uses (team_member, stakeholder, user)
# in addition to the schema-level types (contact, account, organization, contract, product).
_IN_SCOPE_TYPES: list[str] = [
    "contact",
    "account",
    "organization",
    "contract",
    "product",
    "team_member",
    "stakeholder",
    "user",
]

# Embedding-residual similarity threshold (D-03 / RESEARCH.md §2).
# Conservative — tune empirically on first build.
_SIM_THRESHOLD = 0.85

# OpenAI embedding model — matches AutoGraph EMBEDDING_DIMENSIONS=512
_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIM   = 512

# Canonical name embedding cache (Pitfall 8: avoid repeated API calls)
_CACHE_PATH = _REPO_ROOT / ".planning" / "cache" / "canonical_embeddings.json"

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
# DDL helper
# ---------------------------------------------------------------------------


def _ensure_collection(db, name: str, edge: bool = False) -> None:
    """Create collection if it does not exist. Idempotent."""
    if not db.has_collection(name):
        db.create_collection(name, edge=edge)
        print(f"[bridge]   Created collection: {name} (edge={edge})")
    else:
        print(f"[bridge]   Collection already exists: {name}")


# ---------------------------------------------------------------------------
# Edge key (sha256 — colon-safe; NEVER use string concat for AutoGraph keys)
# ---------------------------------------------------------------------------


def _edge_key(from_id: str, to_id: str) -> str:
    """
    Colon-safe deterministic edge _key for same_as collection.

    AutoGraph _key values contain ':' (e.g. 'northwind_slack_0_a:8b4f0a65075f_1').
    Direct string concat fails ArangoDB key validation (error 1221).
    sha256 hex is alphanumeric only — always valid.
    """
    return hashlib.sha256(f"{from_id}:{to_id}".encode()).hexdigest()[:32]


# ---------------------------------------------------------------------------
# Edge UPSERT
# ---------------------------------------------------------------------------


def _upsert_same_as_edge(
    collection,
    from_id: str,
    to_id: str,
    match_method: str,
    matched_surface_form: str,
    confidence: float,
) -> None:
    """
    UPSERT a single same_as edge. _key is sha256(from:to)[:32].
    Idempotent — safe to re-run after any AutoGraph rebuild.

    from_id / to_id: fully-qualified collection/document IDs,
    e.g. "customer360_Entities/northwind_slack_0_a:8b4f0a65075f_1"
    and  "canonical_entities/633f43bd-5cbd-579e-9105-2ded0f2e7c76"
    """
    doc = {
        "_key":                 _edge_key(from_id, to_id),
        "_from":                from_id,
        "_to":                  to_id,
        "match_method":         match_method,         # "deterministic" | "embedding"
        "matched_surface_form": matched_surface_form,
        "confidence":           confidence,           # 1.0 for deterministic, cosine sim for embedding
    }
    collection.insert(doc, overwrite=True, overwrite_mode="update")


# ---------------------------------------------------------------------------
# Alias-dict construction
# ---------------------------------------------------------------------------


def build_alias_dict() -> dict[str, str]:
    """
    Returns {surface_form_lower: entity_id}.

    Source A: canonical names from structured JSON (Contact full_name, Account account_name).
              Also adds last-name-alone alias for Contacts (not Accounts).
    Source B: ground_truth_mentions from manifest.json coref_hard entries.

    All keys stored lowercase. Strip on lookup.
    """
    alias_dict: dict[str, str] = {}

    def _safe_alias_set(key: str, incoming: str, source: str) -> None:
        """
        Conflict-detecting alias_dict assignment.

        Raises ValueError if the same surface form is already mapped to a
        DIFFERENT entity_id — surfaced before any DB write (D-04, ENT-01).
        Idempotent re-assignment of the same key to the same value is silent.
        New keys assign normally.

        Parameters
        ----------
        key:      lowercased surface form
        incoming: entity_id being assigned
        source:   human-readable description for the error message
        """
        existing = alias_dict.get(key)
        if existing is not None and existing != incoming:
            raise ValueError(
                f"Alias conflict: surface form {key!r} maps to both "
                f"{existing!r} and {incoming!r} "
                f"(source: {source}) — resolve in ground_truth_mentions"
            )
        alias_dict[key] = incoming

    # ------------------------------------------------------------------
    # Source A — canonical Contact names + entity_ids from structured JSON
    # ------------------------------------------------------------------
    contact_files = [
        _STRUCTURED_DIR / "northwind" / "crm" / "northwind_crm_contacts.json",
        _STRUCTURED_DIR / "meridian" / "crm" / "meridian_crm_contacts.json",
    ]
    for path in contact_files:
        if not path.exists():
            print(f"[bridge] WARNING: contact file not found: {path}")
            continue
        for rec in json.loads(path.read_text(encoding="utf-8")):
            eid  = rec.get("entity_id")
            name = rec.get("full_name")
            if eid and name:
                _safe_alias_set(name.lower(), eid, f"contact full_name from {path.name}")
                # Last name alone (Contact only — avoids account name collision)
                last = name.split()[-1]
                _safe_alias_set(last.lower(), eid, f"contact last_name from {path.name}")

    # ------------------------------------------------------------------
    # Source A — canonical Account names + account_ids from structured JSON
    # (account_id == entity_id for accounts; RESEARCH.md Pitfall 5)
    # ------------------------------------------------------------------
    account_files = [
        _STRUCTURED_DIR / "northwind" / "crm" / "northwind_crm_accounts.json",
        _STRUCTURED_DIR / "meridian" / "crm" / "meridian_crm_accounts.json",
    ]
    for path in account_files:
        if not path.exists():
            print(f"[bridge] WARNING: account file not found: {path}")
            continue
        for rec in json.loads(path.read_text(encoding="utf-8")):
            eid  = rec.get("account_id")    # account_id == entity_id for accounts
            name = rec.get("account_name")
            if eid and name:
                _safe_alias_set(name.lower(), eid, f"account_name from {path.name}")

    # ------------------------------------------------------------------
    # Source B — coref_hard ground_truth_mentions from manifest.json
    # ------------------------------------------------------------------
    if not _MANIFEST_PATH.exists():
        print(f"[bridge] WARNING: manifest.json not found at {_MANIFEST_PATH}")
    else:
        manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
        for meta in manifest.values():
            if not isinstance(meta, dict) or not meta.get("coref_hard"):
                continue
            for mention_text, expected_id in meta.get("ground_truth_mentions", {}).items():
                _safe_alias_set(
                    mention_text.lower(), expected_id,
                    "ground_truth_mentions from manifest.json"
                )

    return alias_dict


def match_alias(entity_name: str, alias_dict: dict[str, str]) -> str | None:
    """Case-insensitive alias lookup. Returns entity_id or None."""
    return alias_dict.get(entity_name.lower().strip())


# ---------------------------------------------------------------------------
# entity_id stamp on KG Entities
# ---------------------------------------------------------------------------


def stamp_entity_ids(db, name_to_id: dict[str, str]) -> int:
    """
    Stamp entity_id onto matched customer360_Entities rows.

    name_to_id: {exact_entity_name_as_stored_in_kg: entity_id}
    (Use the original case from the KG query result, not lowercased alias key.)

    AQL safety: @matched_names (list) and @name_to_id (dict) are bound via
    bind_vars. Collection name is a hardcoded constant.
    """
    if not name_to_id:
        return 0

    aql = """
        FOR e IN customer360_Entities
          FILTER e.entity_name IN @matched_names
          LET mapped_id = @name_to_id[e.entity_name]
          FILTER mapped_id != null
          UPDATE e WITH { entity_id: mapped_id } IN customer360_Entities
          COLLECT WITH COUNT INTO updated
          RETURN updated
    """
    cursor = db.aql.execute(aql, bind_vars={
        "matched_names": list(name_to_id.keys()),
        "name_to_id":    name_to_id,
    })
    return next(cursor, 0)


# ---------------------------------------------------------------------------
# Embedding-residual helpers (Task 2 — fully implemented)
# ---------------------------------------------------------------------------


def embed_canonical_names(entity_map: dict[str, str]) -> dict[str, list[float]]:
    """
    {entity_id: display_name} → {entity_id: embedding_vector}

    Loads from cache if available and entity_ids match exactly.
    Writes cache on first run to avoid repeated API calls (RESEARCH.md Pitfall 8).
    """
    _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if _CACHE_PATH.exists():
        cached = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        # Cache hit only when the same set of entity_ids is present
        if set(cached.keys()) == set(entity_map.keys()):
            print(f"[bridge]   Embedding cache hit: {_CACHE_PATH}")
            return cached
        else:
            print("[bridge]   Embedding cache stale (entity set changed) — re-embedding")

    import openai  # import here; top-level import would fail if package absent

    client = openai.OpenAI()   # reads OPENAI_API_KEY from env (load_dotenv override=True)
    result: dict[str, list[float]] = {}
    for eid, name in entity_map.items():
        resp = client.embeddings.create(
            model=_EMBED_MODEL,
            input=[name],
            dimensions=_EMBED_DIM,
        )
        result[eid] = resp.data[0].embedding

    _CACHE_PATH.write_text(json.dumps(result), encoding="utf-8")
    print(f"[bridge]   Canonical embeddings written to cache: {_CACHE_PATH}")
    return result


def cosine_sim(a: list[float], b: list[float]) -> float:
    """Offline cosine similarity via numpy — no sklearn needed."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


# ---------------------------------------------------------------------------
# Helper: look up account_id from structured JSON by entity_id
# ---------------------------------------------------------------------------


def _build_entity_to_account_map() -> dict[str, str]:
    """
    Returns {entity_id: account_id} for all contacts and contracts.
    Accounts: entity_id == account_id (same UUID, keyed on account_id).
    """
    entity_to_account: dict[str, str] = {}

    # Contacts: entity_id → account's entity_id (look up parent account)
    for acct_slug in ("northwind", "meridian"):
        contact_path = _STRUCTURED_DIR / acct_slug / "crm" / f"{acct_slug}_crm_contacts.json"
        account_path = _STRUCTURED_DIR / acct_slug / "crm" / f"{acct_slug}_crm_accounts.json"
        if not contact_path.exists() or not account_path.exists():
            continue
        # Get the account_id for this account slug
        accounts = json.loads(account_path.read_text(encoding="utf-8"))
        if len(accounts) > 1:
            print(
                f"[bridge] WARNING: slug '{acct_slug}' maps to {len(accounts)} accounts; "
                f"using accounts[0].account_id — expected exactly 1"
            )
        acct_id = accounts[0].get("account_id") if accounts else None
        contacts = json.loads(contact_path.read_text(encoding="utf-8"))
        for rec in contacts:
            eid = rec.get("entity_id")
            if eid and acct_id:
                entity_to_account[eid] = acct_id

    # Contracts: entity_id → account_id
    for acct_slug in ("northwind", "meridian"):
        for contract_file in (_STRUCTURED_DIR / acct_slug).rglob("*contracts*.json"):
            contracts = json.loads(contract_file.read_text(encoding="utf-8"))
            for rec in contracts:
                eid    = rec.get("entity_id")
                acct_id = rec.get("account_id")
                if eid and acct_id:
                    entity_to_account[eid] = acct_id

    # Accounts: account_id → account_id (self)
    for acct_slug in ("northwind", "meridian"):
        account_path = _STRUCTURED_DIR / acct_slug / "crm" / f"{acct_slug}_crm_accounts.json"
        if not account_path.exists():
            continue
        accounts = json.loads(account_path.read_text(encoding="utf-8"))
        for rec in accounts:
            acct_id = rec.get("account_id")
            if acct_id:
                entity_to_account[acct_id] = acct_id

    return entity_to_account


def _get_display_name_for_entity_id(entity_id: str) -> str:
    """
    Look up the display name for a given entity_id from structured JSON.
    Falls back to the entity_id string if not found.
    """
    # Check contacts
    for acct_slug in ("northwind", "meridian"):
        contact_path = _STRUCTURED_DIR / acct_slug / "crm" / f"{acct_slug}_crm_contacts.json"
        if not contact_path.exists():
            continue
        contacts = json.loads(contact_path.read_text(encoding="utf-8"))
        for rec in contacts:
            if rec.get("entity_id") == entity_id:
                return rec.get("full_name", entity_id)

    # Check accounts
    for acct_slug in ("northwind", "meridian"):
        account_path = _STRUCTURED_DIR / acct_slug / "crm" / f"{acct_slug}_crm_accounts.json"
        if not account_path.exists():
            continue
        accounts = json.loads(account_path.read_text(encoding="utf-8"))
        for rec in accounts:
            if rec.get("account_id") == entity_id:
                return rec.get("account_name", entity_id)

    # Check contracts
    for acct_slug in ("northwind", "meridian"):
        for contract_file in (_STRUCTURED_DIR / acct_slug).rglob("*contracts*.json"):
            contracts = json.loads(contract_file.read_text(encoding="utf-8"))
            for rec in contracts:
                if rec.get("entity_id") == entity_id:
                    return rec.get("contract_name", entity_id)

    return entity_id


# ---------------------------------------------------------------------------
# main()
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build canonical entity bridge (offline).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        dest="dry_run",
        help="Print what would happen but skip all writes.",
    )
    parser.add_argument(
        "--alias-only",
        action="store_true",
        dest="alias_only",
        help="Skip embedding-residual step (uses alias dict only).",
    )
    args = parser.parse_args()

    if args.dry_run:
        print("[bridge] DRY-RUN mode — no writes will be made")

    # ------------------------------------------------------------------
    # Step 1 — Load alias dict (no DB required)
    # ------------------------------------------------------------------
    print("[bridge] Step 1: Building alias dict...")
    alias_dict = build_alias_dict()
    print(f"[bridge]   Alias dict: {len(alias_dict)} surface forms")

    # ------------------------------------------------------------------
    # Step 2 — Connect to ArangoDB
    # ------------------------------------------------------------------
    print("[bridge] Step 2: Connecting to ArangoDB...")
    db = _get_db()
    print("[bridge]   Connected.")

    # ------------------------------------------------------------------
    # Step 3 — DDL: ensure canonical_entities + same_as collections exist
    # ------------------------------------------------------------------
    print("[bridge] Step 3: Ensuring collections...")
    if not args.dry_run:
        _ensure_collection(db, _COLLECTION_CANONICAL, edge=False)
        _ensure_collection(db, _COLLECTION_SAME_AS,   edge=True)
    else:
        print(f"[bridge]   DRY-RUN: would ensure '{_COLLECTION_CANONICAL}' (vertex)")
        print(f"[bridge]   DRY-RUN: would ensure '{_COLLECTION_SAME_AS}' (edge)")

    # ------------------------------------------------------------------
    # Step 4 — Query KG entities in scope
    # ------------------------------------------------------------------
    print("[bridge] Step 4: Querying in-scope KG entities...")

    if not db.has_collection(_COLLECTION_ENTITIES):
        print(
            f"[bridge] WARNING: '{_COLLECTION_ENTITIES}' collection not found — "
            "run build_unstructured.py first"
        )
        print("[bridge] Done — deterministic: 0, embedding: 0, unmatched: 0")
        return

    aql_kg = """
        FOR e IN customer360_Entities
          FILTER e.entity_type IN @in_scope_types
          RETURN {
            _id:         e._id,
            _key:        e._key,
            entity_name: e.entity_name,
            entity_type: e.entity_type,
            embedding:   e.embedding
          }
    """
    cursor = db.aql.execute(aql_kg, bind_vars={"in_scope_types": _IN_SCOPE_TYPES})
    kg_entities = list(cursor)
    print(f"[bridge]   Found {len(kg_entities)} in-scope KG entities")

    # ------------------------------------------------------------------
    # Step 5 — Pass 1: Deterministic alias-dict match
    # ------------------------------------------------------------------
    print("[bridge] Step 5: Pass 1 — deterministic alias-dict matching...")

    deterministic_matches: list[dict] = []
    unmatched_kg_entities: list[dict] = []
    name_to_id: dict[str, str] = {}   # {exact_kg_entity_name: entity_id}

    def _safe_name_to_id_set(entity_name: str, matched_id: str, pass_label: str) -> None:
        """
        Conflict-detecting name_to_id assignment.

        Raises ValueError if the same entity_name is about to be assigned a
        second, different canonical id (e.g., deterministic vs. embedding pass
        disagree, or two KG entities with the same name map to different hubs).
        Idempotent re-assignment of the same entity_name to the same id is silent.
        New keys assign normally.

        Parameters
        ----------
        entity_name: exact KG entity name (original case)
        matched_id:  canonical entity_id being assigned
        pass_label:  human-readable description for the error message
        """
        existing = name_to_id.get(entity_name)
        if existing is not None and existing != matched_id:
            raise ValueError(
                f"name_to_id conflict: entity_name {entity_name!r} maps to both "
                f"{existing!r} and {matched_id!r} "
                f"(pass: {pass_label}) — resolve in ground_truth_mentions or alias dict"
            )
        name_to_id[entity_name] = matched_id

    for entity in kg_entities:
        entity_name = entity.get("entity_name", "")
        matched_id  = match_alias(entity_name, alias_dict)
        if matched_id:
            # Record original case for the stamp step
            deterministic_matches.append({
                "kg_entity":           entity,
                "entity_id":           matched_id,
                "matched_surface_form": entity_name.strip(),
            })
            _safe_name_to_id_set(entity_name, matched_id, "Pass 1 deterministic")
        else:
            unmatched_kg_entities.append(entity)

    print(f"[bridge]   Deterministic matches: {len(deterministic_matches)}")
    print(f"[bridge]   Unmatched after alias pass: {len(unmatched_kg_entities)}")

    # ------------------------------------------------------------------
    # Step 6 — Pass 2: Embedding-residual (skip if --alias-only)
    # ------------------------------------------------------------------
    embedding_matches: list[dict] = []

    if args.alias_only:
        print(
            f"[bridge] Step 6: Pass 2 skipped (--alias-only). "
            f"{len(unmatched_kg_entities)} entities left unlinked."
        )
    else:
        print("[bridge] Step 6: Pass 2 — embedding-residual matching...")

        # Build canonical_entity_map from deterministic matches + shared fallback set
        # (ensures embedding step always has canonical targets even if alias dict was empty).
        # Source of truth: scripts/demo_critical.py (IN-03 — no duplicated id literal here).
        _HARDCODED_CANONICAL: dict[str, str] = {
            eid: entry["display_name"]
            for eid, entry in DEMO_CRITICAL_ENTITIES.items()
        }
        canonical_entity_map: dict[str, str] = dict(_HARDCODED_CANONICAL)
        # Augment with display names from deterministic matches
        for m in deterministic_matches:
            eid = m["entity_id"]
            display = _get_display_name_for_entity_id(eid)
            canonical_entity_map[eid] = display

        try:
            canonical_vectors = embed_canonical_names(canonical_entity_map)
        except Exception as exc:
            print(
                f"[bridge] WARNING: embedding step failed ({exc}); "
                "unmatched entities left unlinked"
            )
            canonical_vectors = {}

        if canonical_vectors:
            # Filter unmatched to those with a non-null/non-empty embedding field
            embeddable = [
                e for e in unmatched_kg_entities
                if e.get("embedding") and len(e["embedding"]) > 0
            ]
            print(f"[bridge]   {len(embeddable)} unmatched entities have embeddings to compare")

            for entity in embeddable:
                entity_name  = entity.get("entity_name", "")
                entity_embed = entity["embedding"]
                best_score   = -1.0
                best_eid     = None

                for eid, cvec in canonical_vectors.items():
                    score = cosine_sim(entity_embed, cvec)
                    if score > best_score:
                        best_score = score
                        best_eid   = eid

                if best_score >= _SIM_THRESHOLD and best_eid:
                    canonical_display = canonical_entity_map.get(best_eid, best_eid)
                    print(
                        f"[bridge]   embedding match: '{entity_name}' → "
                        f"'{canonical_display}' "
                        f"(score={best_score:.4f}, threshold={_SIM_THRESHOLD})"
                    )
                    embedding_matches.append({
                        "kg_entity":           entity,
                        "entity_id":           best_eid,
                        "matched_surface_form": entity_name.strip(),
                        "confidence":          best_score,
                    })
                    _safe_name_to_id_set(entity_name, best_eid, "Pass 2 embedding")
                else:
                    print(
                        f"[bridge]   unmatched (below threshold): '{entity_name}' "
                        f"(best score={best_score:.4f})"
                    )

            print(
                f"[bridge]   Embedding matches: {len(embedding_matches)} "
                f"(threshold={_SIM_THRESHOLD})"
            )
        else:
            print("[bridge]   Embedding step skipped — no canonical vectors available")

    # ------------------------------------------------------------------
    # Step 7 — UPSERT hub rows + same_as edges for all matches
    # ------------------------------------------------------------------
    print("[bridge] Step 7: UPSERTing hub rows and same_as edges...")

    entity_to_account = _build_entity_to_account_map()
    edge_collection   = db.collection(_COLLECTION_SAME_AS) if not args.dry_run else None
    hub_collection    = db.collection(_COLLECTION_CANONICAL) if not args.dry_run else None

    def _process_match(kg_entity: dict, entity_id: str, matched_surface_form: str,
                       match_method: str, confidence: float) -> None:
        """UPSERT hub + edges for one match (deterministic or embedding)."""
        # (a) Build hub document
        account_id   = entity_to_account.get(entity_id, "")
        display_name = _get_display_name_for_entity_id(entity_id)
        hub_doc = {
            "_key":         entity_id,
            "canonical_id": entity_id,
            "display_name": display_name,
            "entity_type":  kg_entity.get("entity_type", ""),
            "account_id":   account_id,
        }
        hub_to_id = f"{_COLLECTION_CANONICAL}/{entity_id}"

        if args.dry_run:
            print(
                f"[bridge]   DRY-RUN: would UPSERT hub {hub_to_id} + edges for "
                f"'{kg_entity.get('entity_name')}' "
                f"(method={match_method}, confidence={confidence:.4f})"
            )
            return

        # (b) UPSERT hub
        hub_collection.insert(hub_doc, overwrite=True, overwrite_mode="update")

        # (c) UPSERT KG → hub edge
        _upsert_same_as_edge(
            edge_collection,
            from_id              = kg_entity["_id"],
            to_id                = hub_to_id,
            match_method         = match_method,
            matched_surface_form = matched_surface_form,
            confidence           = confidence,
        )

        # (d) UPSERT structured → hub edges for each structured node with this entity_id
        # Contacts: FILTER by entity_id
        _upsert_structured_edges(
            db, edge_collection, entity_id, hub_to_id,
            match_method, matched_surface_form, confidence,
        )

    def _upsert_structured_edges(
        db, edge_collection, entity_id: str, hub_to_id: str,
        match_method: str, matched_surface_form: str, confidence: float,
    ) -> None:
        """
        For a given entity_id, find every structured node carrying it and
        write same_as edges pointing to the hub.

        Contact nodes: FILTER n.entity_id == @eid
        Account nodes: FILTER n.account_id == @eid  (Pitfall 5 — account_id != entity_id field)
        Contract nodes: FILTER n.entity_id == @eid
        """
        # Contacts
        aql_contact = """
            FOR n IN Contact
              FILTER n.entity_id == @eid
              RETURN n._id
        """
        for nid in db.aql.execute(aql_contact, bind_vars={"eid": entity_id}):
            _upsert_same_as_edge(
                edge_collection,
                from_id              = nid,
                to_id                = hub_to_id,
                match_method         = match_method,
                matched_surface_form = matched_surface_form,
                confidence           = confidence,
            )

        # Accounts (keyed on account_id, NOT entity_id — Pitfall 5)
        aql_account = """
            FOR n IN Account
              FILTER n.account_id == @eid
              RETURN n._id
        """
        for nid in db.aql.execute(aql_account, bind_vars={"eid": entity_id}):
            _upsert_same_as_edge(
                edge_collection,
                from_id              = nid,
                to_id                = hub_to_id,
                match_method         = match_method,
                matched_surface_form = matched_surface_form,
                confidence           = confidence,
            )

        # Contracts
        aql_contract = """
            FOR n IN Contract
              FILTER n.entity_id == @eid
              RETURN n._id
        """
        for nid in db.aql.execute(aql_contract, bind_vars={"eid": entity_id}):
            _upsert_same_as_edge(
                edge_collection,
                from_id              = nid,
                to_id                = hub_to_id,
                match_method         = match_method,
                matched_surface_form = matched_surface_form,
                confidence           = confidence,
            )

    # Process deterministic matches
    for m in deterministic_matches:
        _process_match(
            kg_entity            = m["kg_entity"],
            entity_id            = m["entity_id"],
            matched_surface_form = m["matched_surface_form"],
            match_method         = "deterministic",
            confidence           = 1.0,
        )

    # Process embedding matches
    for m in embedding_matches:
        _process_match(
            kg_entity            = m["kg_entity"],
            entity_id            = m["entity_id"],
            matched_surface_form = m["matched_surface_form"],
            match_method         = "embedding",
            confidence           = m["confidence"],
        )

    # ------------------------------------------------------------------
    # Step 8 — Stamp entity_id onto matched customer360_Entities rows
    # ------------------------------------------------------------------
    print("[bridge] Step 8: Stamping entity_id onto matched KG Entities...")
    if not args.dry_run:
        stamped = stamp_entity_ids(db, name_to_id)
        print(f"[bridge]   Stamped entity_id on {stamped} KG Entities row(s)")
    else:
        print(f"[bridge]   DRY-RUN: would stamp {len(name_to_id)} KG Entities row(s)")

    # ------------------------------------------------------------------
    # Step 9 — Summary
    # ------------------------------------------------------------------
    total_matched  = len(deterministic_matches) + len(embedding_matches)
    total_unmatched = len(kg_entities) - total_matched

    print(
        f"[bridge] Done — deterministic: {len(deterministic_matches)}, "
        f"embedding: {len(embedding_matches)}, "
        f"unmatched: {total_unmatched}"
    )


if __name__ == "__main__":
    main()
