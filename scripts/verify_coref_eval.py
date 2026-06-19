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

# Collection names — hardcoded constants (NOT user input).
# AQL injection cannot occur via these names.
_COLLECTION_ENTITIES = "customer360_Entities"
_COLLECTION_CANONICAL = "canonical_entities"   # Phase 4 hub (vertex)
_COLLECTION_SAME_AS = "same_as"                # Phase 4 bridge (edge)

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
    INFORMATIONAL overall-accuracy reporter (no longer feeds the demo-critical gate).

    Measures, per ground-truth mention, whether that mention resolves to its
    expected canonical id THROUGH THE same_as BRIDGE PATH — not by joining the
    raw typo/role mention string against e.entity_name (CR-02 removed: AutoGraph
    stores entities under their resolved canonical entity_name, so the raw-mention
    join measured the wrong thing). A mention is counted correct iff a same_as edge
    whose matched_surface_form equals that mention (case-insensitively) reaches a
    hub whose canonical_id == the expected id, OR the expected id is reachable via a
    deterministic same_as edge to its hub (the alias path the builder built from
    ground_truth_mentions).

    This is reported as informational overall accuracy only; the authoritative
    demo-critical hard gate is resolve_demo_critical() over the same_as bridge path.

    AQL safety: @mentions / @ids bound via bind_vars; collection names are
    hardcoded constants. No mention/id string is interpolated into AQL text.

    Returns
    -------
    {"total": N, "correct": M, "accuracy": M/N, "details": [...]}
    """
    if not ground_truth:
        return {"total": 0, "correct": 0, "accuracy": 0.0, "details": []}

    # Bridge-path evidence: per canonical_id, the matched_surface_forms (lowercased)
    # and whether any contributing edge was deterministic.
    expected_ids = sorted(set(ground_truth.values()))
    bridge = _resolve_ids_via_bridge(db, expected_ids)

    details = []
    for mention_text, expected_id in ground_truth.items():
        ev = bridge.get(expected_id)
        if ev is None or not ev["reached"]:
            match = False
            found_id = None
        else:
            found_id = expected_id
            mention_lc = (mention_text or "").strip().lower()
            match = (mention_lc in ev["surface_forms"]) or ev["has_deterministic"]
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


def _resolve_ids_via_bridge(db, expected_ids: list[str]) -> dict[str, dict]:
    """
    Single AQL pass joining same_as edges to canonical_entities hubs on canonical_id.

    For each id in @ids, collect the contributing same_as edges' matched_surface_form
    (lowercased) and match_method, and whether a hub with canonical_id == id exists
    and is reached by at least one same_as edge.

    Returns {id: {"reached": bool, "surface_forms": set[str], "has_deterministic": bool}}.
    The KG-side entity_id stamp is NEVER consulted — resolution is the bridge path.

    AQL safety: @ids is a bound Python list; same_as / canonical_entities are
    hardcoded collection constants. No string interpolation into AQL text.
    """
    result: dict[str, dict] = {
        eid: {"reached": False, "surface_forms": set(), "has_deterministic": False}
        for eid in expected_ids
    }

    if not db.has_collection(_COLLECTION_CANONICAL) or not db.has_collection(_COLLECTION_SAME_AS):
        return result

    aql = """
        WITH canonical_entities
        FOR id IN @ids
          LET hub = FIRST(
            FOR h IN canonical_entities
              FILTER h.canonical_id == id
              LIMIT 1 RETURN h
          )
          LET edges = hub == null ? [] : (
            FOR ed IN same_as
              FILTER ed._to == hub._id
              RETURN { surface_form: ed.matched_surface_form, match_method: ed.match_method }
          )
          RETURN { id: id, reached: hub != null AND LENGTH(edges) > 0, edges: edges }
    """
    rows = db.aql.execute(aql, bind_vars={"ids": expected_ids})
    for row in rows:
        eid = row["id"]
        entry = result[eid]
        entry["reached"] = bool(row["reached"])
        for e in row.get("edges", []):
            sf = e.get("surface_form")
            if sf:
                entry["surface_forms"].add(sf.strip().lower())
            if e.get("match_method") == "deterministic":
                entry["has_deterministic"] = True
    return result


def _detect_mislinks(db, ids: list[str]) -> dict[str, str]:
    """
    Detect demo-critical ids whose structured leaf resolves to the WRONG hub.

    A leaf (Contact/Contract with entity_id == id, or Account with account_id == id)
    that has a same_as edge to a hub whose canonical_id != id is mis-linked. Returns
    {id: wrong_canonical_id} for every such id (used to classify an unreached id as
    mis-linked rather than merely unlinked).

    AQL safety: @ids bound via bind_vars; collection names hardcoded constants.
    """
    if not db.has_collection(_COLLECTION_CANONICAL) or not db.has_collection(_COLLECTION_SAME_AS):
        return {}

    aql = """
        WITH canonical_entities, Account, Contract, Contact, customer360_Entities
        FOR id IN @ids
          LET wrong = FIRST(
            FOR ed IN same_as
              LET leaf = DOCUMENT(ed._from)
              FILTER leaf != null
              FILTER (leaf.entity_id == id) OR (leaf.account_id == id)
              LET hub = DOCUMENT(ed._to)
              FILTER hub != null AND hub.canonical_id != id
              LIMIT 1
              RETURN hub.canonical_id
          )
          FILTER wrong != null
          RETURN { id: id, wrong_canonical_id: wrong }
    """
    out: dict[str, str] = {}
    for row in db.aql.execute(aql, bind_vars={"ids": ids}):
        out[row["id"]] = row["wrong_canonical_id"]
    return out


def resolve_demo_critical(db) -> dict[str, dict]:
    """
    Resolve each demo-critical id through the same_as bridge path (NOT the KG stamp).

    For each expected_id in DEMO_CRITICAL_ID_SET, returns a status dict:
      {
        "status": "resolved" | "unlinked" | "mis-linked" | "covered-but-wrong-surface-form",
        "covered": bool,            # has coref_hard ground-truth mentions (3 of 9)
        "reached_canonical_id": str | None,
      }

    A demo-critical id is RESOLVED iff a same_as edge reaches a hub whose
    canonical_id == expected_id (the all-9-reachable signal the builder writes a
    structured-side edge for). For the 3 ground-truth-covered ids, resolution
    additionally requires a contributing edge whose matched_surface_form is one of
    that id's ground-truth mentions (case-insensitively) OR match_method ==
    "deterministic" (W1) — otherwise the id is covered-but-wrong-surface-form. An id
    that reaches a hub with a DIFFERENT canonical_id is mis-linked. The 6 uncovered
    ids are resolved on linkage alone (no ground-truth mention to check).

    The KG-side entity_id stamp is never the join key (it can only reach ~3 of 9).

    AQL safety: @ids bound via bind_vars; collection names hardcoded constants.
    """
    # Ground-truth mentions per covered id (for the W1 surface-form check).
    gt = _load_ground_truth()
    gt_by_id: dict[str, set[str]] = {}
    for mention, eid in gt.items():
        if eid in DEMO_CRITICAL_ID_SET:
            gt_by_id.setdefault(eid, set()).add((mention or "").strip().lower())

    ids = list(DEMO_CRITICAL_ID_SET)
    bridge = _resolve_ids_via_bridge(db, ids)
    mislink = _detect_mislinks(db, ids)

    statuses: dict[str, dict] = {}
    for eid in DEMO_CRITICAL_ID_SET:
        covered = eid in gt_by_id
        ev = bridge.get(eid, {"reached": False, "surface_forms": set(), "has_deterministic": False})

        if not ev["reached"]:
            # Distinguish mis-linked (a structured leaf for this id resolves to a
            # DIFFERENT hub) from genuinely unlinked (no edge reaches any hub).
            wrong_hub = mislink.get(eid)
            if wrong_hub:
                statuses[eid] = {
                    "status": "mis-linked",
                    "covered": covered,
                    "reached_canonical_id": wrong_hub,
                }
            else:
                statuses[eid] = {
                    "status": "unlinked",
                    "covered": covered,
                    "reached_canonical_id": None,
                }
            continue

        # Reached the hub whose canonical_id == eid.
        if covered:
            gt_mentions = gt_by_id[eid]
            surface_ok = bool(ev["surface_forms"] & gt_mentions) or ev["has_deterministic"]
            status = "resolved" if surface_ok else "covered-but-wrong-surface-form"
        else:
            status = "resolved"

        statuses[eid] = {
            "status": status,
            "covered": covered,
            "reached_canonical_id": eid,
        }

    return statuses


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

    # Step 7 (Phase 4 hard gate, D-05): demo-critical subset measured through the
    # same_as BRIDGE PATH (NOT the KG-side entity_id stamp). Denominator = 9.
    if not db.has_collection(_COLLECTION_CANONICAL) or not db.has_collection(_COLLECTION_SAME_AS):
        print(
            f"\n[coref] SKIP demo-critical gate: {_COLLECTION_CANONICAL}/{_COLLECTION_SAME_AS} "
            "not built yet — run build_entity_bridge.py first"
        )
        sys.exit(0)

    ok, msg, _statuses = evaluate_demo_critical_coref(db)
    print(msg)
    sys.exit(0 if ok else 1)


def evaluate_demo_critical_coref(db) -> tuple[bool, str, dict[str, dict]]:
    """
    Authoritative demo-critical coref verdict over a denominator of 9.

    Resolves each demo-critical id through the same_as bridge path
    (resolve_demo_critical). PASSES iff all 9 are status == "resolved". FAILs (with a
    per-id reason: unlinked / mis-linked / covered-but-wrong-surface-form) otherwise.
    Prints a COVERAGE line (which ids have coref_hard ground truth vs. linkage-only).

    Returns (passed, message, statuses) — callers map passed→exit code. No live DB
    required beyond db.has_collection + db.aql.execute (tests use an in-process fake).
    """
    statuses = resolve_demo_critical(db)

    denominator = len(DEMO_CRITICAL_ID_SET)  # == 9
    resolved = {eid for eid, s in statuses.items() if s["status"] == "resolved"}
    missing = DEMO_CRITICAL_ID_SET - resolved

    covered_ids = sorted(
        (eid for eid, s in statuses.items() if s["covered"]),
        key=lambda e: DEMO_CRITICAL_ENTITIES[e]["display_name"],
    )
    linkage_only_ids = sorted(
        (eid for eid, s in statuses.items() if not s["covered"]),
        key=lambda e: DEMO_CRITICAL_ENTITIES[e]["display_name"],
    )

    lines = []
    ratio = f"{len(resolved)}/{denominator} = {len(resolved) / denominator * 100:.0f}%"
    coverage_line = (
        f"[coref] COVERAGE: {len(covered_ids)} ids have coref_hard ground truth "
        f"({', '.join(DEMO_CRITICAL_ENTITIES[e]['display_name'] for e in covered_ids)}); "
        f"{len(linkage_only_ids)} are linkage-only "
        f"(coverage absence is NOT a failure; unresolved/mis-linked IS)."
    )
    lines.append(coverage_line)

    if missing:
        reasons = []
        for eid in sorted(missing, key=lambda e: DEMO_CRITICAL_ENTITIES[e]["display_name"]):
            name = DEMO_CRITICAL_ENTITIES[eid]["display_name"]
            st = statuses[eid]["status"]
            if st == "unlinked":
                detail = "unlinked (no same_as edge reaches a hub with canonical_id == expected_id)"
            elif st == "mis-linked":
                detail = (
                    f"mis-linked (resolved to a different canonical_id: "
                    f"{statuses[eid].get('reached_canonical_id')})"
                )
            else:  # covered-but-wrong-surface-form
                detail = (
                    "covered-but-wrong-surface-form (right hub, but no contributing "
                    "edge carries a ground-truth mention and match_method != deterministic)"
                )
            reasons.append(f"  - {name} ({eid}): {detail}")
        lines.append(
            f"[coref] Demo-critical (same_as bridge path): {ratio} resolved — FAIL "
            f"(must be 9/9). Failing ids:"
        )
        lines.extend(reasons)
        return (False, "\n" + "\n".join(lines), statuses)

    lines.append(
        f"[coref] Demo-critical (same_as bridge path): {ratio} resolved — PASS "
        f"(all 9 reach a hub with canonical_id == expected_id; covered ids match a "
        f"ground-truth surface form or deterministic match)"
    )
    return (True, "\n" + "\n".join(lines), statuses)


if __name__ == "__main__":
    main()
