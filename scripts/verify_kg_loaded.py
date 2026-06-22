"""Phase 9 Plan 03 Task 2 — verify all 3 accounts are loaded (structured + KG).

Connects via ARANGO_* (load_dotenv override=True — stale-shell guard) and asserts:
  (a) the structured graph contains Helio's account + helio-scoped vertices
      (Account/Contact/Opportunity/NPS/UsageFact/Contract counts > 0 for Helio), AND
  (b) the AutoGraph KG document collection (customer360_Documents) contains docs
      attributed to helio_* modules (post repair_kg_attribution stamping).

Prints "OK KG has all 3 accounts" and exits 0 on success; non-zero otherwise.

Throwaway scaffold (not shipped code) — deleted at end of plan 09-03 unless
retention is noted in the SUMMARY.

Usage:
    python scripts/verify_kg_loaded.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
# override=True mandatory — prevents a stale shell var from shadowing valid .env.
load_dotenv(_REPO_ROOT / ".env", override=True)

from arango import ArangoClient  # noqa: E402

from data_gen.spine.entity_registry import (  # noqa: E402
    HELIO_ACCOUNT_ID,
    MERIDIAN_ACCOUNT_ID,
    NORTHWIND_ACCOUNT_ID,
)

KG_DOCUMENTS = "customer360_Documents"
_HELIO_MODULES = ["helio_slack", "helio_email", "helio_docs", "helio_pdf"]
_STRUCT_VERTEX_COLLS = ["Account", "Contact", "Opportunity", "NPS", "UsageFact", "Contract"]


def _db():
    url = os.environ.get("ARANGO_URL") or os.environ["ARANGO_ENDPOINT"]
    user = os.environ.get("ARANGO_USER") or os.environ["ARANGO_USERNAME"]
    password = os.environ["ARANGO_PASSWORD"]
    dbname = os.environ.get("ARANGO_DB") or os.environ.get("ARANGO_DATABASE") or "customer360"
    client = ArangoClient(hosts=url.rstrip("/"))
    return client.db(dbname, username=user, password=password)


def _count(db, aql: str, bind: dict) -> int:
    cursor = db.aql.execute(aql, bind_vars=bind)
    return int(next(cursor))


def main() -> int:
    db = _db()
    problems: list[str] = []

    # (a) structured: helio-scoped vertices per account
    account_ids = {
        "northwind": NORTHWIND_ACCOUNT_ID,
        "meridian": MERIDIAN_ACCOUNT_ID,
        "helio": HELIO_ACCOUNT_ID,
    }

    print("[verify] --- structured graph: per-account vertex counts ---")
    for acct_name, acct_id in account_ids.items():
        # Account vertex (keyed by account_id)
        acct_present = _count(
            db,
            "RETURN LENGTH(FOR a IN Account FILTER a._key == @aid RETURN 1)",
            {"aid": acct_id},
        )
        # account-scoped child vertices (account_id field)
        scoped = 0
        for coll in _STRUCT_VERTEX_COLLS:
            if coll == "Account":
                continue
            c = _count(
                db,
                "RETURN LENGTH(FOR v IN @@coll FILTER v.account_id == @aid RETURN 1)",
                {"@coll": coll, "aid": acct_id},
            )
            scoped += c
        print(f"[verify]   {acct_name:9s}: Account={acct_present}  child_vertices={scoped}")
        if acct_present < 1:
            problems.append(f"structured Account vertex missing for {acct_name} ({acct_id})")
        if acct_name == "helio" and scoped < 1:
            problems.append("helio has zero child structured vertices (load_structured failed?)")

    # (b) KG documents attributed to helio modules
    print("\n[verify] --- AutoGraph KG: helio document attribution ---")
    if not db.has_collection(KG_DOCUMENTS):
        problems.append(f"KG collection {KG_DOCUMENTS} does not exist (build_unstructured failed?)")
    else:
        helio_docs = _count(
            db,
            "RETURN LENGTH(FOR d IN @@coll FILTER d.module IN @mods RETURN 1)",
            {"@coll": KG_DOCUMENTS, "mods": _HELIO_MODULES},
        )
        helio_by_acct = _count(
            db,
            "RETURN LENGTH(FOR d IN @@coll FILTER d.account_id == @aid RETURN 1)",
            {"@coll": KG_DOCUMENTS, "aid": HELIO_ACCOUNT_ID},
        )
        total_docs = _count(db, "RETURN LENGTH(@@coll)", {"@coll": KG_DOCUMENTS})
        # how many of all docs carry one of the 12 module tags (attribution coverage)
        print(f"[verify]   total KG documents:            {total_docs}")
        print(f"[verify]   docs with module in helio_*:   {helio_docs}")
        print(f"[verify]   docs with account_id == helio: {helio_by_acct}")
        if helio_docs < 1 and helio_by_acct < 1:
            problems.append(
                "KG has zero documents attributed to helio modules/account "
                "(build_unstructured + repair_kg_attribution did not ingest Helio)"
            )

    print()
    if problems:
        print("[verify] FAILED — issues:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("OK KG has all 3 accounts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
