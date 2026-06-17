"""
D-05 coreference-hard supplementary noise document generator.

Creates 4 hard coreference documents for Meridian contacts. Each document:
  - References the person by alias at least twice (e.g. "JO approved the renewal")
  - References them by pronoun at least once ("He reviewed the proposal")
  - Contains the person's name misspelled once (deliberate — for eval harness)
  - Is annotated with ground_truth_mentions: {alias/misspelled → canonical entity_id}

These docs are added to meridian_docs as role="noise" so they don't pollute the
6-question signal/near-miss sets. They provide the D-05 ground truth that
verify_coref_eval.py measures entity-extraction accuracy against.

No LLM calls — all content is programmatically templated.
Standalone script — no LLM client imports.

Usage:
  python scripts/add_coref_hard_docs.py          # generate (idempotent)
  python scripts/add_coref_hard_docs.py --force  # re-generate even if files exist
"""

import argparse
import json
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
# Imports from spine (canonical source — do NOT redeclare)
# ---------------------------------------------------------------------------

from data_gen.spine.entity_registry import (  # noqa: E402
    MERIDIAN_ACCOUNT_ID,
    canonical_uuid,
    make_citable_url,
    make_file_name,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MANIFEST_PATH = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_MERIDIAN_DOCS_DIR = _REPO_ROOT / "data_gen" / "output" / "unstructured" / "meridian_docs"

# ---------------------------------------------------------------------------
# Coref-hard doc definitions
#
# 4 entries: two for James Okafor (different alias each), one for Taylor Brooks,
# one for Patricia Vance. All Meridian contacts from spine_meridian.py.
#
# ground_truth_mentions maps alias/misspelled_text → canonical entity_id
# so verify_coref_eval.py can check whether AutoGraph resolves the mention.
# Each entry has ≥2 keys (alias + misspelling).
# ---------------------------------------------------------------------------

COREF_HARD_DOCS: list[dict] = [
    # Doc 1: James Okafor — alias "JO", misspelling "Okafer"
    {
        "event_id": "me_coref_hard_001",
        "module": "meridian_docs",
        "account_id": MERIDIAN_ACCOUNT_ID,
        "persona_canonical": "james_okafor",
        "persona_full_name": "James Okafor",
        "persona_title": "Director of Engineering",
        "alias": "JO",
        "alias_description": "the director",
        "pronoun_subject": "He",
        "pronoun_object": "him",
        "pronoun_possessive": "his",
        "misspelling": "Okafer",
        "ground_truth_mentions": {
            "JO": canonical_uuid("meridian", "contact:james_okafor"),
            "Okafer": canonical_uuid("meridian", "contact:james_okafor"),
            "the director": canonical_uuid("meridian", "contact:james_okafor"),
        },
    },
    # Doc 2: James Okafor — alias "Director Okafor", misspelling "Ockafar"
    {
        "event_id": "me_coref_hard_002",
        "module": "meridian_docs",
        "account_id": MERIDIAN_ACCOUNT_ID,
        "persona_canonical": "james_okafor",
        "persona_full_name": "James Okafor",
        "persona_title": "Director of Engineering",
        "alias": "Director Okafor",
        "alias_description": "the engineering lead",
        "pronoun_subject": "He",
        "pronoun_object": "him",
        "pronoun_possessive": "his",
        "misspelling": "Ockafar",
        "ground_truth_mentions": {
            "Director Okafor": canonical_uuid("meridian", "contact:james_okafor"),
            "Ockafar": canonical_uuid("meridian", "contact:james_okafor"),
            "the engineering lead": canonical_uuid("meridian", "contact:james_okafor"),
        },
    },
    # Doc 3: Taylor Brooks — alias "TB", misspelling "Brookes"
    {
        "event_id": "me_coref_hard_003",
        "module": "meridian_docs",
        "account_id": MERIDIAN_ACCOUNT_ID,
        "persona_canonical": "taylor_brooks",
        "persona_full_name": "Taylor Brooks",
        "persona_title": "Engineering Manager",
        "alias": "TB",
        "alias_description": "the engineering manager",
        "pronoun_subject": "They",
        "pronoun_object": "them",
        "pronoun_possessive": "their",
        "misspelling": "Brookes",
        "ground_truth_mentions": {
            "TB": canonical_uuid("meridian", "contact:taylor_brooks"),
            "Brookes": canonical_uuid("meridian", "contact:taylor_brooks"),
            "the engineering manager": canonical_uuid("meridian", "contact:taylor_brooks"),
        },
    },
    # Doc 4: Patricia Vance — alias "PV", misspelling "Vaance"
    {
        "event_id": "me_coref_hard_004",
        "module": "meridian_docs",
        "account_id": MERIDIAN_ACCOUNT_ID,
        "persona_canonical": "patricia_vance",
        "persona_full_name": "Patricia Vance",
        "persona_title": "CFO",
        "alias": "PV",
        "alias_description": "the CFO",
        "pronoun_subject": "She",
        "pronoun_object": "her",
        "pronoun_possessive": "her",
        "misspelling": "Vaance",
        "ground_truth_mentions": {
            "PV": canonical_uuid("meridian", "contact:patricia_vance"),
            "Vaance": canonical_uuid("meridian", "contact:patricia_vance"),
            "the CFO": canonical_uuid("meridian", "contact:patricia_vance"),
        },
    },
]

# ---------------------------------------------------------------------------
# Document body templates (programmatic — no LLM calls)
# ---------------------------------------------------------------------------

# Prohibited signal keywords (D-05: noise docs must not contain signal content)
# These are the same terms that the near-miss guard checks for signal docs.
_PROHIBITED_TERMS = [
    "red annotation", "partnership health", "unresolved", "at risk",
    "escalation", "competitor", "renewal risk", "unlogged commitment", "feature gap",
    "scale limit", "GenAI intent", "GraphRAG", "whitespace", "upsell",
    "capacity ceiling",
]


def _build_doc_body(entry: dict) -> str:
    """
    Build the plain-text doc body from the entry dict.

    Rules:
    1. Alias appears ≥2 times
    2. Pronoun appears ≥1 time
    3. Misspelling appears exactly once
    4. ~150–250 words, looks like a Meridian internal doc/Slack note
    5. Does NOT contain any of the locked-question signal keywords
    """
    alias = entry["alias"]
    alias_desc = entry["alias_description"]
    pronoun_s = entry["pronoun_subject"]
    pronoun_o = entry["pronoun_object"]
    pronoun_poss = entry["pronoun_possessive"]
    misspelling = entry["misspelling"]
    full_name = entry["persona_full_name"]
    title = entry["persona_title"]
    event_id = entry["event_id"]

    # Each doc is a distinct internal note scenario to keep them varied
    if event_id == "me_coref_hard_001":
        body = (
            f"Team Update — Engineering Coordination Note\n\n"
            f"{alias} joined the weekly engineering sync today and walked the team through "
            f"the upcoming infrastructure maintenance window. {pronoun_s} outlined the "
            f"expected downtime for the cluster migration and confirmed that the on-call "
            f"rotation had been updated accordingly.\n\n"
            f"Per {alias_desc}, all teams should complete their pre-maintenance checklists "
            f"by end of week. {pronoun_s} also reminded {pronoun_o} that the post-migration "
            f"review meeting is scheduled for the following Monday.\n\n"
            f"Action items recorded from the session include: (1) {alias} to share the "
            f"updated runbook with all engineering leads, (2) each lead to confirm "
            f"{pronoun_poss} team is briefed on the maintenance protocol, and (3) "
            f"infrastructure team to validate backup snapshots are complete.\n\n"
            f"Note: {misspelling} approved the proposed maintenance window timeline and "
            f"gave the green light to proceed. No blockers were raised during the session."
        )
    elif event_id == "me_coref_hard_002":
        body = (
            f"Internal Note — Architecture Review Coordination\n\n"
            f"{alias} led the architecture review session this quarter, covering the "
            f"proposed changes to the data pipeline configuration. {pronoun_s} presented "
            f"a clear summary of the tradeoffs between the two proposed approaches and "
            f"facilitated a productive discussion with the platform team.\n\n"
            f"According to {alias_desc}, the preferred approach aligns with the existing "
            f"cluster topology and will require minimal reconfiguration. {pronoun_s} "
            f"confirmed that {pronoun_poss} team will prepare a detailed implementation "
            f"plan for review next sprint.\n\n"
            f"Follow-up items: (1) {alias} to circulate the architecture decision record "
            f"by end of week, (2) platform team to review the proposed schema changes, "
            f"(3) {pronoun_poss} notes from today's session to be shared in the shared "
            f"workspace.\n\n"
            f"Separately, {misspelling} confirmed the timeline for the integration "
            f"testing phase and indicated no resource conflicts are expected."
        )
    elif event_id == "me_coref_hard_003":
        body = (
            f"Coordination Note — Engineering Team Handoff\n\n"
            f"{alias} facilitated the engineering handoff session this week, walking the "
            f"team through the transition plan for the platform upgrade project. "
            f"{pronoun_s} clarified responsibilities across the sub-teams and confirmed "
            f"the delivery milestones for the upcoming sprint.\n\n"
            f"As noted by {alias_desc}, the primary dependencies have been identified and "
            f"tracked in the project board. {pronoun_s} confirmed that {pronoun_poss} team "
            f"is aligned on priorities and that no blockers are currently outstanding.\n\n"
            f"Key decisions from the session: (1) {alias} will own the integration "
            f"testing coordination, (2) documentation updates are due before the sprint "
            f"close, (3) {pronoun_poss} team will sync with the platform group on the "
            f"dependency resolution timeline.\n\n"
            f"Note from earlier thread: {misspelling} confirmed availability for the "
            f"upcoming demo walkthrough and will prepare the pre-read materials in advance."
        )
    else:  # me_coref_hard_004
        body = (
            f"Finance Coordination Note — Budget Review Cycle\n\n"
            f"{alias} joined the cross-functional budget review today and provided "
            f"the finance team's perspective on the upcoming planning cycle. "
            f"{pronoun_s} confirmed that the operating budget allocations have been "
            f"finalized and are ready for sign-off from the respective team leads.\n\n"
            f"Per {alias_desc}, the approval workflow will follow the standard process "
            f"and all teams should submit their finalized cost center reports before "
            f"the deadline. {pronoun_s} also noted that {pronoun_poss} team will send "
            f"a reminder to any outstanding approvers early next week.\n\n"
            f"Action items: (1) {alias} to confirm receipt of all submitted reports, "
            f"(2) team leads to review and approve cost center allocations by Friday, "
            f"(3) {pronoun_poss} team will issue final consolidated figures after approval.\n\n"
            f"Reference from prior note: {misspelling} flagged a minor discrepancy in "
            f"the previous cycle's reporting but confirmed it has since been resolved."
        )

    return body


def _build_doc_content(entry: dict) -> str:
    """
    Build the full document file content with the HTML metadata comment header.

    Format matches the Phase 2 generator convention:
      <!-- {"module": "...", "account_id": "...", "entity_id": "...", "citable_url": "..."} -->
      <body text>
    """
    event_id = entry["event_id"]
    module = entry["module"]
    account_id = entry["account_id"]
    entity_id = canonical_uuid("meridian", f"doc:{event_id}")
    citable_url = make_citable_url("meridian", "docs", event_id)

    metadata = json.dumps({
        "module": module,
        "account_id": account_id,
        "entity_id": entity_id,
        "citable_url": citable_url,
    })
    header = f"<!-- {metadata} -->"
    body = _build_doc_body(entry)

    return f"{header}\n\n{body}\n"


def _check_prohibited_terms(content: str, event_id: str) -> None:
    """Verify no prohibited signal terms leaked into the noise doc."""
    content_lower = content.lower()
    violations = [t for t in _PROHIBITED_TERMS if t.lower() in content_lower]
    if violations:
        raise ValueError(
            f"[coref] ERROR: {event_id} contains prohibited terms: {violations}"
        )


# ---------------------------------------------------------------------------
# File write
# ---------------------------------------------------------------------------

def write_doc(entry: dict) -> tuple[str, str]:
    """
    Write one coref-hard doc to meridian_docs.

    Returns (file_name, entity_id) tuple.
    Prints [coref] Written {file_name}.
    """
    event_id = entry["event_id"]
    file_name = make_file_name(entry["module"], event_id, "txt")
    out_path = _MERIDIAN_DOCS_DIR / file_name

    content = _build_doc_content(entry)
    _check_prohibited_terms(content, event_id)

    out_path.write_text(content, encoding="utf-8")
    print(f"[coref] Written {file_name}")

    entity_id = canonical_uuid("meridian", f"doc:{event_id}")
    return file_name, entity_id


# ---------------------------------------------------------------------------
# Manifest update
# ---------------------------------------------------------------------------

def update_manifest(new_entries: dict) -> None:
    """
    Read existing manifest.json, merge new_entries (keyed by file_name), write back.

    Safety: asserts existing entry count is unchanged after write (T-03-02-01).
    New entries must not overwrite existing entries — coref_hard keys are distinct.
    """
    if not _MANIFEST_PATH.exists():
        raise FileNotFoundError(
            f"manifest.json not found at {_MANIFEST_PATH} — run data_gen/generate.py first"
        )

    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    existing_count = len(manifest)

    # Merge — new keys only; do not overwrite existing entries
    new_count = 0
    for file_name, meta in new_entries.items():
        if file_name not in manifest:
            manifest[file_name] = meta
            new_count += 1

    # Assert existing entries were not removed (T-03-02-01 tamper check)
    final_count = len(manifest)
    assert final_count >= existing_count, (
        f"[coref] FATAL: manifest write would remove existing entries "
        f"(before={existing_count}, after={final_count})"
    )

    _MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[coref] Manifest updated: +{new_count} entries (total: {final_count})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(force: bool = False) -> None:
    """
    Generate 4 coref-hard docs and update manifest.json.

    Idempotent: skips files that already exist in both manifest and disk
    (unless --force is specified).
    """
    print(f"[coref] Starting D-05 coreference-hard doc generation ({len(COREF_HARD_DOCS)} docs)")

    _MERIDIAN_DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # Load manifest to check existing entries
    if not _MANIFEST_PATH.exists():
        raise FileNotFoundError(
            f"manifest.json not found at {_MANIFEST_PATH} — run data_gen/generate.py first"
        )
    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))

    new_manifest_entries: dict = {}
    written_count = 0
    skipped_count = 0

    for entry in COREF_HARD_DOCS:
        event_id = entry["event_id"]
        file_name = make_file_name(entry["module"], event_id, "txt")
        entity_id = canonical_uuid("meridian", f"doc:{event_id}")
        citable_url = make_citable_url("meridian", "docs", event_id)

        out_path = _MERIDIAN_DOCS_DIR / file_name

        # Idempotency check: skip if already in manifest AND file exists on disk
        if not force and file_name in manifest and out_path.exists():
            print(f"[coref] SKIP {file_name} (already in manifest and file exists)")
            skipped_count += 1
            continue

        # Write the doc file
        written_file_name, _ = write_doc(entry)
        written_count += 1

        # Build manifest entry
        new_manifest_entries[written_file_name] = {
            "module": entry["module"],
            "account_id": entry["account_id"],
            "entity_id": entity_id,
            "citable_url": citable_url,
            "role": "noise",
            "questions_served": [],
            "coref_hard": True,
            "ground_truth_mentions": entry["ground_truth_mentions"],
        }

    # Update manifest with all new entries at once
    if new_manifest_entries:
        update_manifest(new_manifest_entries)
    else:
        print(f"[coref] No new entries to write to manifest")

    # Summary
    print(f"\n[coref] --- Summary ---")
    print(f"  Total docs defined: {len(COREF_HARD_DOCS)}")
    print(f"  Written: {written_count}")
    print(f"  Skipped (already exist): {skipped_count}")

    if written_count > 0 or skipped_count == len(COREF_HARD_DOCS):
        print(f"\n[coref] D-05 ground truth ready — run scripts/verify_coref_eval.py --quick to check")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="D-05 coreference-hard doc generator for Meridian (supplementary noise).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Re-generate even if files already exist in manifest and on disk.",
    )
    args = parser.parse_args()
    main(force=args.force)
