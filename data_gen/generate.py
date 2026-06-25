"""
data_gen/generate.py — Single deterministic entrypoint for the full generation pipeline.

D-06 determinism: runs all generators in dependency order with a global seed.
Running generate.py twice with the same cache produces identical output.

Usage:
    python data_gen/generate.py             # incremental (uses LLM cache)
    python data_gen/generate.py --clean     # wipes output/ and regenerates from scratch

The --clean flag removes data_gen/output/ before running. Without --clean,
existing cached LLM responses are reused (prompt-hash caching in prose_client.py).

Generator order (dependency-safe):
    1. CRM (Salesforce)        — structured
    2. Snowflake usage metrics — structured
    3. DocuSign contracts      — structured
    4. Slack threads           — unstructured
    5. Emails                  — unstructured
    6. Docs (Markdown)         — unstructured
    7. PDFs                    — unstructured
    8. Write manifest.json
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup — ensure repo root is on sys.path when run as a script
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from faker import Faker

from data_gen.spine.entity_registry import MODULE_NAMES, GLOBAL_SEED
from data_gen.spine.spine_northwind import NORTHWIND_SPINE
from data_gen.spine.spine_meridian import MERIDIAN_SPINE
from data_gen.spine.spine_helio import HELIO_SPINE

from data_gen.generators.crm_generator import generate_crm
from data_gen.generators.usage_generator import generate_usage
from data_gen.generators.contract_generator import generate_contracts
from data_gen.generators.slack_generator import generate_slack
from data_gen.generators.email_generator import generate_emails
from data_gen.generators.docs_generator import generate_docs
from data_gen.generators.pdf_generator import generate_pdfs
from data_gen.llm.prose_client import get_prose_stats

# ---------------------------------------------------------------------------
# Directory constants
# ---------------------------------------------------------------------------

_OUTPUT_DIR = _REPO_ROOT / "data_gen" / "output"
_CACHE_DIR = _REPO_ROOT / "data_gen" / "llm" / "cache"
_MANIFEST_PATH = _OUTPUT_DIR / "manifest.json"

_SPINES = [NORTHWIND_SPINE, MERIDIAN_SPINE, HELIO_SPINE]


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------


def _create_output_dirs() -> None:
    """Create all required output directories idempotently."""
    # Structured subdirs per account + source
    for spine in _SPINES:
        account_key = spine.account_name.lower().split()[0]
        for source in ("crm", "snowflake", "docusign"):
            (_OUTPUT_DIR / "structured" / account_key / source).mkdir(parents=True, exist_ok=True)

    # Unstructured subdirs per module
    for module in MODULE_NAMES:
        (_OUTPUT_DIR / "unstructured" / module).mkdir(parents=True, exist_ok=True)

    # LLM cache dir
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _clean_output() -> None:
    """Remove data_gen/output/ to force a clean run (--clean flag)."""
    if _OUTPUT_DIR.exists():
        shutil.rmtree(_OUTPUT_DIR)
        print(f"[clean] Removed {_OUTPUT_DIR}")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def main(clean: bool = False) -> None:
    """Run the full generation pipeline end-to-end."""
    # Seed Faker for deterministic names/emails (D-06)
    Faker.seed(GLOBAL_SEED)

    if clean:
        _clean_output()

    _create_output_dirs()

    # ---------- Structured generators (no LLM calls) ----------
    print("[generate] Running structured generators...")
    for spine in _SPINES:
        account_key = spine.account_name.lower().split()[0]
        print(f"  CRM ({account_key})")
        generate_crm(spine, _OUTPUT_DIR)
        print(f"  Usage metrics ({account_key})")
        generate_usage(spine, _OUTPUT_DIR)
        print(f"  Contracts ({account_key})")
        generate_contracts(spine, _OUTPUT_DIR)

    # ---------- Unstructured generators (LLM prose, cached) ----------
    print("[generate] Running unstructured generators...")
    manifest: dict = {}

    print("  Slack threads")
    manifest.update(generate_slack(_SPINES, _OUTPUT_DIR, _CACHE_DIR))

    print("  Emails")
    manifest.update(generate_emails(_SPINES, _OUTPUT_DIR, _CACHE_DIR))

    print("  Docs (Markdown)")
    manifest.update(generate_docs(_SPINES, _OUTPUT_DIR, _CACHE_DIR))

    print("  PDFs")
    manifest.update(generate_pdfs(_SPINES, _OUTPUT_DIR, _CACHE_DIR))

    # ---------- Write manifest ----------
    _MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, default=str),
        encoding="utf-8",
    )
    print(f"[generate] manifest.json written: {len(manifest)} entries")

    # ---------- Completion summary ----------
    roles = [v.get("role") for v in manifest.values()]
    signal_count = roles.count("signal")
    noise_count = roles.count("noise")
    near_miss_count = roles.count("near-miss")

    # Per-module file counts
    module_counts: dict[str, int] = {}
    for meta in manifest.values():
        mod = meta.get("module", "unknown")
        module_counts[mod] = module_counts.get(mod, 0) + 1

    print("\n[generate] --- Completion Summary ---")
    print(f"  Total unstructured files: {len(manifest)}")
    print(f"  Signal:    {signal_count}")
    print(f"  Noise:     {noise_count}")
    print(f"  Near-miss: {near_miss_count}")
    print("  Per module:")
    for module in MODULE_NAMES:
        print(f"    {module}: {module_counts.get(module, 0)}")

    # Structured file count
    structured_files = list((_OUTPUT_DIR / "structured").rglob("*.json"))
    print(f"  Structured JSON files: {len(structured_files)}")

    # CR-02: prose generation statistics (real LLM vs stub fallback)
    prose_stats = get_prose_stats()
    total_prose = prose_stats["real_llm"] + prose_stats["stub"] + prose_stats["cache_hit"]
    print("\n[generate] --- Prose Generation Statistics (CR-02) ---")
    print(f"  Total prose calls:  {total_prose}")
    print(f"  Real LLM prose:     {prose_stats['real_llm']}")
    print(f"  Cache hits:         {prose_stats['cache_hit']}")
    print(f"  Stub fallbacks:     {prose_stats['stub']}")
    if prose_stats["stub"] > 0:
        print(
            f"  WARNING: {prose_stats['stub']} doc(s) used deterministic stub prose — "
            "check stderr for details"
        )

    print("[generate] Done.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate all synthetic data for the Customer 360 demo."
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        default=False,
        help="Delete data_gen/output/ before generating (forces full re-generation). "
             "Without --clean, the LLM cache is reused for incremental runs (T-02-05-02).",
    )
    args = parser.parse_args()
    main(clean=args.clean)
