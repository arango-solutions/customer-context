"""D-09 presenter reset — restore the corpus to its pre-update state.

Usage:
    python scripts/reset_demo_data.py --dry-run   # show the planned reset steps
    python scripts/reset_demo_data.py             # execute full clean rebuild (LIVE)

Default behavior (safe, proven-green path):
  1. Remove the CDC-01 escalation document from the unstructured source directory
     (data_gen/output/unstructured/meridian_slack_escalation/).
  2. Remove the corresponding manifest entry (module=meridian_slack_escalation).
  3. Invoke scripts/build_unstructured.py (the full clean rebuild) which performs:
       - Full File Manager upload of ALL remaining manifest docs
       - Corpus build (incremental=False)
       - Rag-strategizer analyze + stabilize
       - Delete-first Layer-3 truncate (Stage 3.5)
       - Orchestrate (Stage 4)
       - Wait for KG stabilization (Stage 5)
       - BM25 view DROP+RECREATE (Stage 6.5)
       - HNSW vector index DROP+RECREATE (Stage 6.6)
       - Content-derived attribution repair (Stage 7, repair_kg_attribution.py)

This is the PROVEN-GREEN rebuild: the eval gate (scripts/eval-gate.ts) is GREEN
at 124/124 assertions against the corpus this path produces (Phase 09-03 RESOLVED).

Design note — surgical-delete future optimization (not shipped):
    A faster presenter-path alternative would be:
      (a) delete only the meridian_slack_escalation module's Layer-3 records by
          partition-id prefix (STARTS_WITH AQL sweep, ~5 REMOVEs — same as add_lane.py
          Stage 5 in reverse), and
      (b) re-run repair_kg_attribution.py to clean up any attribution artifacts.
    This would avoid a full rebuild (~10-15 min → ~2-3 min). Deferred because:
      - A full rebuild is authoritative and safe; partial deletes require more edge-case
        testing (empty-module partition cleanup, view/index re-index scoping).
      - Reset happens between demos (not on stage), so latency is not the constraint.
      - The full rebuild path has been validated GREEN; the surgical path has not.
    Implement as a future optimization when the demo cadence demands faster reset cycles.

Requirements:
  - D-09: reset is a presenter-run script/command (NOT an in-UI control panel, which is
    DEMO-01 / Phase 15 — do NOT build that here).
  - CDC-02: after reset, eval-gate.ts must return GREEN (124/124 assertions unchanged).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# override=True is MANDATORY — stale shell OPENAI_API_KEY can shadow the valid .env value.
load_dotenv(_REPO_ROOT / ".env", override=True)

_MANIFEST = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_UNSTRUCTURED = _REPO_ROOT / "data_gen" / "output" / "unstructured"

# The module introduced by the CDC-01 ADD lane. Reset removes exactly this module.
CDC_MODULE = "meridian_slack_escalation"
CDC_MODULE_DIR = _UNSTRUCTURED / CDC_MODULE


def _load_manifest() -> dict:
    return json.loads(_MANIFEST.read_text(encoding="utf-8"))


def _save_manifest(manifest: dict) -> None:
    _MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _remove_escalation_docs(*, dry_run: bool) -> list[str]:
    """Remove all files in the CDC module directory and return the list of removed paths."""
    if not CDC_MODULE_DIR.exists():
        print(f"[reset]   {CDC_MODULE_DIR.name}: directory absent — nothing to remove")
        return []
    removed = []
    for f in sorted(CDC_MODULE_DIR.iterdir()):
        if f.is_file():
            if dry_run:
                print(f"[reset]   DRY-RUN: would remove {f.relative_to(_REPO_ROOT)}")
            else:
                f.unlink()
                print(f"[reset]   removed {f.relative_to(_REPO_ROOT)}")
            removed.append(str(f))
    if not dry_run and CDC_MODULE_DIR.exists():
        # Remove the now-empty directory itself.
        try:
            CDC_MODULE_DIR.rmdir()
            print(f"[reset]   removed directory {CDC_MODULE_DIR.name}/")
        except OSError as exc:
            print(f"[reset]   WARNING: could not remove directory {CDC_MODULE_DIR.name}/: {exc}")
    return removed


def _remove_manifest_entries(manifest: dict, *, dry_run: bool) -> tuple[dict, list[str]]:
    """Remove manifest entries for the CDC module; return (updated_manifest, removed_keys)."""
    to_remove = [k for k, v in manifest.items() if v.get("module") == CDC_MODULE]
    if not to_remove:
        print(f"[reset]   manifest: no entries for module={CDC_MODULE!r} — nothing to remove")
        return manifest, []
    if dry_run:
        for k in to_remove:
            print(f"[reset]   DRY-RUN: would remove manifest entry {k!r} (module={CDC_MODULE!r})")
        return manifest, to_remove
    updated = {k: v for k, v in manifest.items() if k not in to_remove}
    for k in to_remove:
        print(f"[reset]   removed manifest entry {k!r}")
    return updated, to_remove


def main() -> int:
    ap = argparse.ArgumentParser(
        description="D-09 presenter reset — restore corpus to pre-CDC-01 state"
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="show the planned reset steps without executing any destructive operations",
    )
    args = ap.parse_args()
    dry_run = args.dry_run

    if dry_run:
        print("[reset] DRY-RUN — planned reset sequence (no destructive calls):\n")
    else:
        print("[reset] Resetting corpus to pre-CDC-01 state ...")
        print("[reset] NOTE: this is a full clean rebuild (~10-15 min); use --dry-run to preview\n")

    # Step 1 — remove CDC escalation documents from disk
    print(f"[reset] Step 1 — remove CDC escalation docs from {CDC_MODULE_DIR.relative_to(_REPO_ROOT)} ...")
    removed_docs = _remove_escalation_docs(dry_run=dry_run)
    if not removed_docs:
        print("[reset]   (nothing removed)")

    # Step 2 — remove CDC module entries from manifest.json
    print(f"[reset] Step 2 — remove module={CDC_MODULE!r} entries from manifest.json ...")
    manifest = _load_manifest()
    updated_manifest, removed_keys = _remove_manifest_entries(manifest, dry_run=dry_run)
    if not dry_run and removed_keys:
        _save_manifest(updated_manifest)
        print(f"[reset]   manifest.json updated — removed {len(removed_keys)} entry/entries")

    # Step 3 — full clean rebuild (proven-green path)
    print()
    print("[reset] Step 3 — full clean rebuild (scripts/build_unstructured.py) ...")
    print("[reset]   This is the proven-green rebuild path (eval-gate.ts GREEN at 124/124).")
    print("[reset]   Stages: upload → corpus build → strategize → delete-first Layer-3 truncate")
    print("[reset]   → orchestrate → wait → BM25 view recreate → vector index recreate → re-stamp")
    print()
    if dry_run:
        print("[reset]   DRY-RUN: would invoke: python scripts/build_unstructured.py")
        print()
        print("[reset] DRY-RUN complete — no changes made")
        print()
        print("[reset] After a live reset, run:")
        print("[reset]   npx tsx scripts/eval-gate.ts")
        print("[reset]   to confirm the eval gate returns GREEN (124/124 — CDC-02 no-corruption).")
        return 0

    rc = subprocess.run(
        [sys.executable, str(_REPO_ROOT / "scripts" / "build_unstructured.py")],
        cwd=str(_REPO_ROOT),
    ).returncode
    if rc != 0:
        print(f"[reset] FAIL — build_unstructured.py exited {rc}")
        return rc

    print()
    print("[reset] RESET COMPLETE — corpus restored to pre-CDC-01 state.")
    print("[reset] Run the following to confirm the eval gate is GREEN:")
    print("[reset]   npx tsx scripts/eval-gate.ts")
    print("[reset] Expected: GREEN (124/124 assertions — CDC-02 no-corruption verified).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
