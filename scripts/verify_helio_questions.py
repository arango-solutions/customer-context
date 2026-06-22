"""
Throwaway probe (09-01 Task 3) — verifies Q13 is wired across the full eval gate:
eval-gate.ts LOCKED_QUESTION_LABELS, questions.eval.test.ts, test_near_miss_guard.py
QUESTION_TEXTS, and conftest.py QUESTION_IDS all reference Q13.

Run: python scripts/verify_helio_questions.py
Delete after the plan completes — this is a scaffold, not shipped code.
"""

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Files to check (path, human label)
_CHECKS = [
    ("scripts/eval-gate.ts", "eval-gate.ts LOCKED_QUESTION_LABELS"),
    ("agent/test/questions.eval.test.ts", "questions.eval.test.ts"),
    ("data_gen/linter/test_near_miss_guard.py", "test_near_miss_guard.py QUESTION_TEXTS"),
    ("data_gen/linter/conftest.py", "conftest.py QUESTION_IDS"),
]


def main() -> None:
    missing = []
    for rel_path, label in _CHECKS:
        text = (_REPO_ROOT / rel_path).read_text(encoding="utf-8")
        if "Q13" not in text:
            missing.append(label)

    assert not missing, f"Q13 missing from: {missing}"

    # Also confirm conftest QUESTION_IDS literally contains Q13 (imported constant)
    from data_gen.linter.conftest import QUESTION_IDS

    assert "Q13" in QUESTION_IDS, f"Q13 not in conftest QUESTION_IDS: {QUESTION_IDS}"

    # Confirm the near-miss guard defines a q13 test function
    nmg = (_REPO_ROOT / "data_gen/linter/test_near_miss_guard.py").read_text(encoding="utf-8")
    assert "def test_near_miss_guard_q13" in nmg, (
        "test_near_miss_guard_q13 not defined in test_near_miss_guard.py"
    )

    print("OK Q13 wired across gate")


if __name__ == "__main__":
    main()
