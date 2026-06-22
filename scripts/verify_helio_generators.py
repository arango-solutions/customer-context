"""
Throwaway probe (09-01 Task 2) — verifies the 4 unstructured generators dispatch
helio modules to a helio-specific prohibited list (NOT the Northwind fall-through)
and that load_structured registers exactly 6 helio/ structured files.

Run: python scripts/verify_helio_generators.py
Delete after the plan completes — this is a scaffold, not shipped code.
"""

import sys
from datetime import date
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from data_gen.spine.event_spine import DocEvent
from data_gen.generators import (
    slack_generator,
    email_generator,
    docs_generator,
    pdf_generator,
)
from scripts.load_structured import SOURCE_FILES

# Signal vocabulary that MUST NOT appear in a helio module's prohibited list —
# if it does, the helio branch is missing and signal terms would be stripped.
_SIGNAL_VOCAB = ["downgrade", "contraction", "migration", "declining", "churn", "deprioritization"]


def _make_doc(module: str) -> DocEvent:
    return DocEvent(
        event_id="he_probe",
        account_id="probe",
        entity_id="probe",
        module=module,
        file_name="probe.txt",
        citable_url="https://arangodb.com/demo/helio/probe",
        event_date=date(2024, 1, 1),
        role="noise",
        questions_served=[],
        spine_events=[],
    )


def _check_module(label: str, prohibited: list[str]) -> None:
    lowered = " ".join(prohibited).lower()
    for term in _SIGNAL_VOCAB:
        assert term not in lowered, (
            f"{label}: prohibited list contains signal vocab '{term}' "
            f"— helio branch missing (Northwind fall-through). Got: {prohibited}"
        )


def main() -> None:
    # slack: exact-match style (module, doc)
    slack_doc = _make_doc("helio_slack")
    _check_module(
        "helio_slack", slack_generator._get_prohibited_terms("helio_slack", slack_doc)
    )
    # email/docs/pdf: startswith style (module only)
    _check_module("helio_email", email_generator._get_prohibited_terms("helio_email"))
    _check_module("helio_docs", docs_generator._get_prohibited_terms("helio_docs"))
    _check_module("helio_pdf", pdf_generator._get_prohibited_terms("helio_pdf"))

    # load_structured: exactly 6 helio/ paths (one per entity type)
    all_paths = [p for paths in SOURCE_FILES.values() for p in paths]
    helio_paths = [p for p in all_paths if p.startswith("helio/")]
    assert len(helio_paths) == 6, (
        f"expected exactly 6 helio/ paths in SOURCE_FILES, got {len(helio_paths)}: {helio_paths}"
    )

    print("OK generators + loader helio-aware")


if __name__ == "__main__":
    main()
