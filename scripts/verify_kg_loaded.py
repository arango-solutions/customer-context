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

import json
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
_MANIFEST = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_HELIO_MODULES = ["helio_slack", "helio_email", "helio_docs", "helio_pdf"]
_NORTHWIND_MODULES = ["northwind_slack", "northwind_email", "northwind_docs", "northwind_pdf"]
_MERIDIAN_MODULES = ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"]
_STRUCT_VERTEX_COLLS = ["Account", "Contact", "Opportunity", "NPS", "UsageFact", "Contract"]

# Clean-rebuild expectation: the KG must contain exactly the manifest's docs (139),
# NOT 244 (= 105 stale 2-account + 139 new). A count materially above the manifest
# size means the delete-first truncate did not run (stale-doc contamination).
_DOC_COUNT_TOLERANCE = 10  # absolute slack for AutoGraph splitting/merging a doc


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

    # (b) KG documents — CLEAN rebuild attribution (NOT contaminated 244-doc state)
    print("\n[verify] --- AutoGraph KG: clean-rebuild document attribution ---")
    if not db.has_collection(KG_DOCUMENTS):
        problems.append(f"KG collection {KG_DOCUMENTS} does not exist (build_unstructured failed?)")
    else:
        manifest = json.loads(_MANIFEST.read_text(encoding="utf-8"))
        expected_total = len(manifest)  # 139 clean docs

        total_docs = _count(db, "RETURN LENGTH(@@coll)", {"@coll": KG_DOCUMENTS})

        # (b1) total docs ≈ manifest size — NOT the contaminated 244
        print(f"[verify]   total KG documents:            {total_docs} (expect ~{expected_total})")
        if abs(total_docs - expected_total) > _DOC_COUNT_TOLERANCE:
            problems.append(
                f"KG document count {total_docs} deviates from manifest size {expected_total} "
                f"by > {_DOC_COUNT_TOLERANCE} — stale-doc contamination (delete-first truncate did "
                f"not run) OR ingest mismatch. A clean rebuild must NOT be the 244-doc contaminated set."
            )

        # (b2) every doc attributed — no null module/account_id (scramble left docs unattributed)
        null_module = _count(
            db,
            "RETURN LENGTH(FOR d IN @@coll FILTER d.module == null OR d.module == '' RETURN 1)",
            {"@coll": KG_DOCUMENTS},
        )
        null_acct = _count(
            db,
            "RETURN LENGTH(FOR d IN @@coll FILTER d.account_id == null OR d.account_id == '' RETURN 1)",
            {"@coll": KG_DOCUMENTS},
        )
        print(f"[verify]   docs with null/empty module:   {null_module}")
        print(f"[verify]   docs with null/empty account:  {null_acct}")
        if null_module > 0:
            problems.append(f"{null_module} KG docs have null/empty module (attribution incomplete)")
        if null_acct > 0:
            problems.append(f"{null_acct} KG docs have null/empty account_id (attribution incomplete)")

        # (b3) all 3 accounts present and attributed in the KG (module + account_id)
        account_modules = {
            "northwind": (_NORTHWIND_MODULES, NORTHWIND_ACCOUNT_ID),
            "meridian": (_MERIDIAN_MODULES, MERIDIAN_ACCOUNT_ID),
            "helio": (_HELIO_MODULES, HELIO_ACCOUNT_ID),
        }
        print("[verify]   per-account KG attribution:")
        for acct_name, (mods, acct_id) in account_modules.items():
            by_module = _count(
                db,
                "RETURN LENGTH(FOR d IN @@coll FILTER d.module IN @mods RETURN 1)",
                {"@coll": KG_DOCUMENTS, "mods": mods},
            )
            by_acct = _count(
                db,
                "RETURN LENGTH(FOR d IN @@coll FILTER d.account_id == @aid RETURN 1)",
                {"@coll": KG_DOCUMENTS, "aid": acct_id},
            )
            print(f"[verify]     {acct_name:9s}: module={by_module}  account_id={by_acct}")
            if by_module < 1:
                problems.append(f"KG has zero documents with a {acct_name}_* module (account missing from KG)")
            if by_acct < 1:
                problems.append(f"KG has zero documents with account_id == {acct_name} (attribution failed)")

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
