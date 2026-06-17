"""
Post-build account_id UPSERT for customer360_Documents.

Reads data_gen/output/manifest.json (file_name → {account_id, entity_id}) and
stamps account_id + entity_id onto every customer360_Documents record whose
file_name appears in the manifest.

This is required after every AutoGraph build (full or partition-scoped) because
the Documents collection is rebuilt by AutoGraph and loses the cross-graph bridge
key.  After the UPSERT, Probe 3 (cross-graph join: Document.account_id → Account._key)
will resolve correctly.

Usage:
  python scripts/stamp_account_id.py              # stamp all 105 docs
  python scripts/stamp_account_id.py --dry-run    # print mapping stats, no writes
  python scripts/stamp_account_id.py --modules northwind_slack northwind_email

AQL safety:
  Two hardcoded AQL string literals (filter variant / no-filter variant) — selected
  by if/else BEFORE calling db.aql.execute().  All values (@mapping, @file_names) are
  passed through bind_vars.  The collection name customer360_Documents is a hardcoded
  module-level constant — never derived from user input or manifest keys.
  No f-string or .format() AQL body construction anywhere in this file.
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
# Constants
# ---------------------------------------------------------------------------

_MANIFEST_PATH = _REPO_ROOT / "data_gen" / "output" / "manifest.json"

# Collection name — hardcoded constant (NOT from user input or manifest keys).
# AQL injection cannot occur via this name.
_COLLECTION_DOCUMENTS = "customer360_Documents"


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
# Manifest loader
# ---------------------------------------------------------------------------

def _load_manifest() -> dict:
    """
    Read data_gen/output/manifest.json.

    Returns the full dict keyed by file_name.  Includes both the original
    101 docs and the 4 coref-hard docs (all 105 files in the built corpus).
    """
    if not _MANIFEST_PATH.exists():
        print(
            f"[stamp] ERROR: manifest.json not found at {_MANIFEST_PATH} — "
            "run data_gen/generate.py first",
            file=sys.stderr,
        )
        sys.exit(1)

    return json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Stamp function
# ---------------------------------------------------------------------------

def stamp_account_ids(
    db,
    manifest: dict,
    file_names: list[str] | None = None,
) -> int:
    """
    Stamp account_id + entity_id onto customer360_Documents keyed by file_name.

    Parameters
    ----------
    db : python-arango StandardDatabase
    manifest : dict keyed by file_name → {account_id, entity_id, ...}
    file_names : optional list to restrict the update to specific file_names
                 (used by --modules to re-stamp only the rebuilt partitions)

    Returns
    -------
    int — count of documents updated (0 if none matched)

    AQL safety:
    - Two hardcoded AQL strings selected by if/else — no dynamic AQL construction.
    - @mapping bind var is a dict {file_name → {account_id, entity_id}}.
    - @file_names bind var is a list of file_name strings.
    - The collection name customer360_Documents is a hardcoded constant, never from
      user input or manifest keys.
    """
    # Build the mapping dict from manifest — only the two fields we need to stamp.
    mapping = {
        fname: {
            "account_id": meta["account_id"],
            "entity_id": meta.get("entity_id"),
        }
        for fname, meta in manifest.items()
        if isinstance(meta, dict) and meta.get("account_id")
    }

    if not mapping:
        print("[stamp] WARNING: manifest produced an empty mapping — nothing to stamp", file=sys.stderr)
        return 0

    # SAFETY: Two hardcoded AQL strings — NO f-string AQL bodies anywhere.
    # The file_names filter variant is selected by if/else before db.aql.execute().
    # All values flow through bind_vars; the collection name is a hardcoded constant.
    if file_names:
        aql = """
            FOR doc IN customer360_Documents
              FILTER doc.file_name IN @file_names
              LET m = @mapping[doc.file_name]
              FILTER m != null
              UPDATE doc WITH {
                account_id: m.account_id,
                entity_id:  m.entity_id
              } IN customer360_Documents
              COLLECT WITH COUNT INTO updated
              RETURN updated
        """
        cursor = db.aql.execute(
            aql,
            bind_vars={"mapping": mapping, "file_names": file_names},
        )
    else:
        aql = """
            FOR doc IN customer360_Documents
              LET m = @mapping[doc.file_name]
              FILTER m != null
              UPDATE doc WITH {
                account_id: m.account_id,
                entity_id:  m.entity_id
              } IN customer360_Documents
              COLLECT WITH COUNT INTO updated
              RETURN updated
        """
        cursor = db.aql.execute(aql, bind_vars={"mapping": mapping})

    return next(cursor, 0)


# ---------------------------------------------------------------------------
# Verify: count null account_id remaining
# ---------------------------------------------------------------------------

def _count_null_account_id(db) -> int:
    """
    Return count of customer360_Documents where account_id IS NULL after the stamp.
    AQL safety: no bind_vars needed — the null comparison uses a literal and the
    collection name is a hardcoded constant.
    """
    aql_null_count = """
        FOR doc IN customer360_Documents
          FILTER doc.account_id == null
          COLLECT WITH COUNT INTO n
          RETURN n
    """
    cursor = db.aql.execute(aql_null_count)
    return next(cursor, 0)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Stamp account_id + entity_id onto customer360_Documents keyed by file_name. "
            "Must be run after every AutoGraph build (full or partition-scoped) to restore "
            "the cross-graph bridge key needed for D-04 Probe 3."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        dest="dry_run",
        help="Print manifest mapping stats without writing to ArangoDB.",
    )
    parser.add_argument(
        "--modules",
        nargs="+",
        default=None,
        metavar="MODULE",
        help=(
            "Restrict stamp to file_names belonging to specific modules "
            "(e.g. --modules northwind_slack meridian_docs). "
            "The module is inferred from the file_name prefix (file_name starts with module_)."
        ),
    )
    args = parser.parse_args()

    # Step 1: Load manifest
    print("[stamp] Step 1 — loading manifest")
    manifest = _load_manifest()
    total_manifest_entries = len(manifest)
    print(f"[stamp]   Manifest loaded: {total_manifest_entries} entries")

    # Step 2: Build file_names filter list if --modules is specified
    file_names_filter: list[str] | None = None
    if args.modules:
        file_names_filter = [
            fname
            for fname, meta in manifest.items()
            if isinstance(meta, dict) and any(
                fname.startswith(mod + "_") for mod in args.modules
            )
        ]
        print(
            f"[stamp]   Module filter: {args.modules} → {len(file_names_filter)} files"
        )
        if not file_names_filter:
            print(
                f"[stamp] WARNING: no manifest entries match modules {args.modules}",
                file=sys.stderr,
            )

    # Build mapping for stats print
    mapping = {
        fname: {
            "account_id": meta["account_id"],
            "entity_id": meta.get("entity_id"),
        }
        for fname, meta in manifest.items()
        if isinstance(meta, dict) and meta.get("account_id")
    }
    print(f"[stamp]   Mapping entries with account_id: {len(mapping)}")

    if args.dry_run:
        print("[stamp] --dry-run: skipping DB write")
        print(f"[stamp]   Would stamp {len(mapping)} documents")
        # Count unique account_ids
        unique_accounts = {v["account_id"] for v in mapping.values()}
        print(f"[stamp]   Unique account_ids: {len(unique_accounts)} — {sorted(unique_accounts)}")
        print("[stamp] --dry-run PASSED")
        sys.exit(0)

    # Step 3: Connect to DB
    print("[stamp] Step 2 — connecting to ArangoDB")
    try:
        db = _get_db()
        print("[stamp]   Connected OK")
    except Exception as exc:
        print(f"[stamp] FATAL: Could not connect to ArangoDB: {exc}", file=sys.stderr)
        sys.exit(1)

    # Check collection exists
    if not db.has_collection(_COLLECTION_DOCUMENTS):
        print(
            "[stamp] SKIP: customer360_Documents not found — "
            "run build_unstructured.py first",
            file=sys.stderr,
        )
        sys.exit(0)

    total_docs = db.collection(_COLLECTION_DOCUMENTS).count()
    print(f"[stamp]   customer360_Documents: {total_docs} total documents")

    # Step 4: Run the stamp UPSERT
    print("[stamp] Step 3 — stamping account_id + entity_id on customer360_Documents")
    try:
        updated = stamp_account_ids(db, manifest, file_names=file_names_filter)
    except Exception as exc:
        print(f"[stamp] ERROR during AQL UPDATE: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"[stamp]   Updated: {updated} document(s)")

    # Step 5: Verify null count
    print("[stamp] Step 4 — verifying null account_id count")
    null_count = _count_null_account_id(db)
    print(f"[stamp]   Null account_id remaining: {null_count}")

    if null_count == 0:
        print(
            f"[stamp] PASSED: {updated} docs stamped, 0 null account_id remaining"
        )
    else:
        print(
            f"[stamp] WARNING: {null_count} document(s) still have null account_id — "
            "these file_names may not appear in manifest.json",
            file=sys.stderr,
        )
        # Exit 0 even if some remain null — they may be preflight/test documents
        # injected by build_unstructured.py that don't belong to our manifest
        print(f"[stamp]   Non-manifest docs (null account_id): {null_count}")


if __name__ == "__main__":
    main()
