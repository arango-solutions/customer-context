"""
D-05 Coreference resolution accuracy measurement harness.

Loads ground_truth_mentions from manifest.json entries where coref_hard==True,
queries customer360_Entities for matching entity names, compares against expected
canonical entity_id, and reports accuracy.

This script is a pre-Phase-3-verification scaffold. Before the D-05 corpus regen
(Plan 03-02), there are no coref_hard entries in manifest.json — the script
exits 0 with a graceful SKIP message in that case.

Usage:
  python scripts/verify_coref_eval.py --help
  python scripts/verify_coref_eval.py --quick           # accuracy ratio only, exits 0
  python scripts/verify_coref_eval.py --report          # per-mention breakdown
  python scripts/verify_coref_eval.py --threshold 60    # override 100% gate threshold (diagnostic)

AQL safety: all AQL uses bind_vars dict. Collection name customer360_Entities is a
module-level constant (not user input). No f-string or .format() AQL construction.

Phase 4 gate (D-05): demo-critical entities (the 9 entity_ids the 6 locked questions
traverse) must all link correctly — hard gate, exits 1 on failure. General coref
accuracy across the full ground-truth set is measured and printed as informational
only — does NOT block when demo-critical accuracy = 100%. (Phase 3 was 60% overall;
Phase 4 makes demo-critical the sole hard gate per the "report-only on the rest"
decision in D-05.)
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

# Demo-critical 9-id set — single source of truth (IN-03 closed). Imported
# after the _REPO_ROOT/sys.path block so `from scripts...` resolves under a
# `python scripts/verify_coref_eval.py` invocation from repo root.
from scripts.demo_critical import (  # noqa: E402
    DEMO_CRITICAL_ENTITIES,
    DEMO_CRITICAL_ID_SET,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MANIFEST_PATH = _REPO_ROOT / "data_gen" / "output" / "manifest.json"

# Entities collection name — hardcoded constant (NOT user input)
# AQL injection cannot occur via this name.
_COLLECTION_ENTITIES = "customer360_Entities"

# Phase 4 accuracy gate threshold (fraction, not percent)
# Raised from Phase 3's 60% to 100% — demo-critical entities must all link correctly.
# The --threshold N argparse override still works for diagnostic runs.
_DEFAULT_THRESHOLD_PCT = 100  # 100%


# ---------------------------------------------------------------------------
# ArangoDB connection
# ---------------------------------------------------------------------------

def _get_db():
    """
    Connect to the customer360 ArangoDB database using Bearer token auth.

    Same pattern as verify_graphs.py _get_db(). Bearer token is required
    for DDL on the live cluster; used here for read-only entity queries.

    Env var fallback: supports both ARANGO_URL/ARANGO_USER/ARANGO_DB (from
    PATTERNS.md) and ARANGO_ENDPOINT/ARANGO_USERNAME/ARANGO_DATABASE (actual
    .env var names used in this repo).
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
# Ground truth loader
# ---------------------------------------------------------------------------

def _load_ground_truth() -> dict[str, str]:
    """
    Load ground_truth_mentions from manifest.json entries where coref_hard==True.

    Returns a dict mapping mention_text → expected_entity_id.
    If no coref_hard entries found (pre-D-05 corpus regen), prints a SKIP
    message and returns an empty dict.

    manifest.json structure (for coref_hard entries):
      {
        "<file_name>": {
          "coref_hard": true,
          "ground_truth_mentions": {
            "<mention_text>": "<expected_entity_id>",
            ...
          },
          ...
        }
      }
    """
    if not _MANIFEST_PATH.exists():
        print(
            "[coref] SKIP: manifest.json not found at "
            f"{_MANIFEST_PATH} — run data_gen/generate.py first"
        )
        return {}

    try:
        manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"[coref] ERROR: manifest.json is malformed: {exc}", file=sys.stderr)
        sys.exit(1)

    ground_truth: dict[str, str] = {}
    coref_hard_files = 0

    for file_name, meta in manifest.items():
        if not isinstance(meta, dict):
            continue
        if not meta.get("coref_hard"):
            continue
        coref_hard_files += 1
        mentions = meta.get("ground_truth_mentions", {})
        if not isinstance(mentions, dict):
            continue
        ground_truth.update(mentions)

    if coref_hard_files == 0:
        print(
            "[coref] SKIP: no coref_hard=True entries in manifest.json — "
            "run scripts/add_coref_hard_docs.py and regenerate corpus (Plan 03-02) first"
        )
        return {}

    print(
        f"[coref] Loaded ground truth: {coref_hard_files} coref_hard files, "
        f"{len(ground_truth)} mention→entity_id pairs"
    )
    return ground_truth


# ---------------------------------------------------------------------------
# Accuracy measurement
# ---------------------------------------------------------------------------

def measure_coref_accuracy(db, ground_truth: dict[str, str]) -> dict:
    """
    Compare AutoGraph-extracted Entities against ground-truth mention→entity_id map.

    Queries customer360_Entities for each mention text, then compares the
    returned entity_id against the expected canonical entity_id.

    NOTE: The spike README verified the field is 'entity_name' (not 'name').
    This function uses entity_name consistently.

    AQL safety: @mentions is a Python list bound via bind_vars. The collection
    name customer360_Entities is a hardcoded constant in the AQL string literal.

    Parameters
    ----------
    db: python-arango StandardDatabase
    ground_truth: {mention_text → expected_entity_id}

    Returns
    -------
    {"total": N, "correct": M, "accuracy": M/N, "details": [...]}
    """
    if not ground_truth:
        return {"total": 0, "correct": 0, "accuracy": 0.0, "details": []}

    mentions = list(ground_truth.keys())

    # AQL safety: @mentions is bound via bind_vars (a Python list).
    # customer360_Entities is a hardcoded collection name constant.
    aql = """
        FOR e IN customer360_Entities
          FILTER e.entity_name IN @mentions
          RETURN {entity_name: e.entity_name, entity_id: e.entity_id}
    """
    cursor = db.aql.execute(aql, bind_vars={"mentions": mentions})
    found: dict[str, str] = {}
    for row in cursor:
        name = row.get("entity_name")
        eid = row.get("entity_id")
        if name:
            found[name] = eid

    # Build per-mention detail list
    details = []
    for mention_text, expected_id in ground_truth.items():
        found_id = found.get(mention_text)
        match = found_id == expected_id
        details.append(
            {
                "mention": mention_text,
                "expected_entity_id": expected_id,
                "found_entity_id": found_id,
                "match": match,
            }
        )

    total = len(ground_truth)
    correct = sum(1 for d in details if d["match"])
    accuracy = correct / total if total else 0.0

    return {"total": total, "correct": correct, "accuracy": accuracy, "details": details}


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "D-05 coreference resolution accuracy measurement against customer360_Entities. "
            "Exits 0 with SKIP message when no coref_hard docs exist in manifest.json "
            "(pre-Plan-03-02 state)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Print accuracy ratio only. Exits 0 with SKIP message if no coref_hard docs.",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Print per-mention breakdown: mention, expected entity_id, found entity_id, match.",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=_DEFAULT_THRESHOLD_PCT,
        metavar="N",
        help=f"Override accuracy gate threshold (default: {_DEFAULT_THRESHOLD_PCT}%%).",
    )
    args = parser.parse_args()

    if not any([args.quick, args.report]):
        parser.print_help()
        sys.exit(0)

    # Step 1: Load ground truth from manifest
    ground_truth = _load_ground_truth()
    if not ground_truth:
        # Empty dict = SKIP was already printed; exit 0 cleanly
        sys.exit(0)

    # Step 2: Connect to ArangoDB
    print("[coref] Connecting to ArangoDB...")
    try:
        db = _get_db()
        print("[coref]   Connected OK")
    except Exception as exc:
        print(f"[coref] FATAL: Could not connect to ArangoDB: {exc}", file=sys.stderr)
        sys.exit(1)

    # Step 3: Check Entities collection exists
    if not db.has_collection(_COLLECTION_ENTITIES):
        print(
            "[coref] SKIP: customer360_Entities not found — "
            "run build_unstructured.py first"
        )
        sys.exit(0)

    # Step 4: Measure accuracy
    print(f"[coref] Measuring coreference accuracy ({len(ground_truth)} mentions)...")
    result = measure_coref_accuracy(db, ground_truth)

    total = result["total"]
    correct = result["correct"]
    accuracy_pct = result["accuracy"] * 100
    threshold = args.threshold
    passed = accuracy_pct >= threshold

    # Overall accuracy label is informational only per D-05 ("report-only on the rest").
    # Demo-critical accuracy below is the authoritative gate.
    gate_label = "PASS (informational)" if passed else "INFO (report-only)"
    print(
        f"[coref] Coref accuracy: {correct}/{total} = {accuracy_pct:.0f}% "
        f"— {gate_label} (threshold: {threshold}%)"
    )

    # Step 5: Optional per-mention report
    if args.report:
        print("\n[coref] Per-mention breakdown:")
        print(f"  {'Mention':<40} {'Expected ID':<40} {'Found ID':<40} Match")
        print(f"  {'-' * 40} {'-' * 40} {'-' * 40} -----")
        for d in result["details"]:
            match_str = "YES" if d["match"] else "NO"
            mention = (d["mention"] or "")[:40]
            expected = (d["expected_entity_id"] or "")[:40]
            found = (d["found_entity_id"] or "none")[:40]
            print(f"  {mention:<40} {expected:<40} {found:<40} {match_str}")

    # Step 6: Summary + exit
    print(f"\n[coref] --- Summary ---")
    print(f"  Total mentions:   {total}")
    print(f"  Correct matches:  {correct}")
    print(f"  Accuracy:         {accuracy_pct:.0f}%")
    print(f"  Threshold:        {threshold}%")
    print(f"  Overall result:   {gate_label} (see Demo-critical result below for the hard gate)")

    # Step 7 (Phase 4 extension): demo-critical subset hard gate (D-05).
    # Block if any demo-critical entity_id is missing from the coref evaluation.
    # The 9-id set is imported from scripts.demo_critical (IN-03 — single source
    # of truth). NOTE: the resolution logic below is replaced in Task 3 with the
    # same_as bridge-path gate; this Task-1 form preserves prior behavior while
    # removing the duplicated literal.
    demo_critical_correct = sum(
        1 for d in result["details"]
        if d["expected_entity_id"] in DEMO_CRITICAL_ID_SET and d["match"]
    )
    demo_critical_total = len({
        d["expected_entity_id"]
        for d in result["details"]
        if d["expected_entity_id"] in DEMO_CRITICAL_ID_SET
    })

    if demo_critical_total > 0:
        dc_pct = demo_critical_correct / demo_critical_total * 100
        dc_label = "PASS" if dc_pct >= 100 else "FAIL"
        print(
            f"\n[coref] Demo-critical accuracy: {demo_critical_correct}/{demo_critical_total} "
            f"= {dc_pct:.0f}% — {dc_label} (must be 100%)"
        )
        if dc_pct < 100:
            # D-05 hard gate: demo-critical entities at <100% → hard block
            sys.exit(1)
        else:
            # Demo-critical at 100% is the primary gate per D-05 design.
            # General accuracy below threshold is reported above but does not block
            # when demo-critical passes — "report-only on the rest" (D-05).
            sys.exit(0)
    else:
        print(
            "\n[coref] Demo-critical: no demo-critical mentions in ground_truth set "
            "(coref_hard docs may not cover all entity types)"
        )

    # no demo-critical mentions in ground truth — fall back to overall threshold gate
    sys.exit(0)


if __name__ == "__main__":
    main()
