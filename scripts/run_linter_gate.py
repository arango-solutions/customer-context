"""Phase 9 Plan 03 Task 1 — full-linter HARD GATE with anti-false-green enforcement.

Runs the full data integrity linter (`pytest data_gen/linter/ -v`) and exits
non-zero if EITHER:
  (a) any test failed or errored, OR
  (b) any test whose name contains "near_miss" was SKIPPED.

Rationale (RESEARCH Pitfall 1 / threat T-09I-01): the empirical near-miss guard
`pytest.skip`s silently when OPENAI_API_KEY or AUTOGRAPH_PATH is absent, and the
RRF import / empty-doc-list paths can also skip. A skipped near-miss guard means
the single most important grounding gate of this phase never ran — a FALSE GREEN.
This wrapper makes "guard silently skipped" a HARD failure so the linter cannot
report green unless the near-miss guard actually executed.

This is a throwaway scaffold (not shipped code) — deleted at end of plan 09-03
unless retention is noted in the SUMMARY.

Usage:
    AUTOGRAPH_PATH=/Users/plosiewicz/Desktop/autograph python scripts/run_linter_gate.py
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_LINTER_DIR = _REPO_ROOT / "data_gen" / "linter"

# pytest line-result markers look like:
#   data_gen/linter/test_near_miss_guard.py::test_near_miss_guard_q13 PASSED  [ 50%]
#   data_gen/linter/test_near_miss_guard.py::test_near_miss_guard_q13 SKIPPED ...
_RESULT_RE = re.compile(r"::(?P<test>[\w\[\]\-\.]+)\s+(?P<status>PASSED|FAILED|ERROR|SKIPPED)\b")


def main() -> int:
    if not os.environ.get("AUTOGRAPH_PATH"):
        print(
            "FATAL: AUTOGRAPH_PATH is not set. The near-miss guard's RRF import would "
            "fail/skip, producing a FALSE GREEN. Export "
            "AUTOGRAPH_PATH=/Users/plosiewicz/Desktop/autograph and re-run.",
            file=sys.stderr,
        )
        return 2
    if not os.environ.get("OPENAI_API_KEY"):
        # The linter entrypoints use load_dotenv(override=True), so the guard's own
        # process WILL pick up the .env key. We do not hard-fail on the shell var being
        # unset here, because the guard reads .env. But we DO verify post-hoc that the
        # near-miss tests RAN (below) — that is the real anti-false-green check.
        print(
            "[gate] note: OPENAI_API_KEY not in shell env; relying on .env via "
            "load_dotenv(override=True) inside the linter. Verifying guard RAN below.",
        )

    cmd = [sys.executable, "-m", "pytest", str(_LINTER_DIR), "-v", "-p", "no:cacheprovider"]
    print(f"[gate] running: {' '.join(cmd)}")
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(_REPO_ROOT))
    output = proc.stdout + "\n" + proc.stderr
    print(output)

    results: dict[str, str] = {}
    for m in _RESULT_RE.finditer(output):
        results[m.group("test")] = m.group("status")

    failed = [t for t, s in results.items() if s in ("FAILED", "ERROR")]
    near_miss_tests = {t: s for t, s in results.items() if "near_miss" in t}
    near_miss_skipped = [t for t, s in near_miss_tests.items() if s == "SKIPPED"]
    near_miss_ran = [t for t, s in near_miss_tests.items() if s == "PASSED"]

    print("\n[gate] ---- linter gate summary ----")
    print(f"[gate] total tests parsed: {len(results)}")
    print(f"[gate] failed/errored:     {len(failed)} -> {failed}")
    print(f"[gate] near_miss tests:    {len(near_miss_tests)} -> {near_miss_tests}")
    print(f"[gate] near_miss PASSED:   {len(near_miss_ran)}")
    print(f"[gate] near_miss SKIPPED:  {len(near_miss_skipped)} -> {near_miss_skipped}")

    if proc.returncode != 0 and not failed:
        # pytest returned non-zero but our parser found no FAILED/ERROR lines.
        # Treat as a hard failure (collection error, import error, etc.).
        print(
            f"[gate] FATAL: pytest exited {proc.returncode} but no FAILED/ERROR lines "
            "were parsed — likely a collection/import error. Treating as failure.",
            file=sys.stderr,
        )
        return 1

    if failed:
        print(f"[gate] FATAL: {len(failed)} linter test(s) failed/errored.", file=sys.stderr)
        return 1

    if not near_miss_tests:
        print(
            "[gate] FATAL: no near_miss tests were observed in the pytest output at all. "
            "The empirical guard did not run — FALSE GREEN. Aborting.",
            file=sys.stderr,
        )
        return 1

    if near_miss_skipped:
        print(
            f"[gate] FATAL: {len(near_miss_skipped)} near_miss guard test(s) were SKIPPED: "
            f"{near_miss_skipped}. The empirical grounding guard did not run — FALSE GREEN. "
            "Ensure AUTOGRAPH_PATH + OPENAI_API_KEY resolve and docs exist. Aborting.",
            file=sys.stderr,
        )
        return 1

    if len(near_miss_ran) < 6:
        print(
            f"[gate] FATAL: expected 6 near_miss guard tests to PASS (q2/q5/q8/q9/q12/q13), "
            f"only {len(near_miss_ran)} passed: {near_miss_ran}. Aborting.",
            file=sys.stderr,
        )
        return 1

    print(
        f"\n[gate] OK — full linter GREEN and all {len(near_miss_ran)} near-miss guard "
        "tests PROVEN to have RUN (not skipped). Exit 0."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
