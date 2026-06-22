"""
Data generators package.

Entry point: generate_unstructured() — called by data_gen/generate.py (plan 02-05).
"""

import json
from pathlib import Path

from data_gen.generators.slack_generator import generate_slack
from data_gen.generators.email_generator import generate_emails
from data_gen.generators.docs_generator import generate_docs
from data_gen.generators.pdf_generator import generate_pdfs
from data_gen.spine.entity_registry import MODULE_NAMES

_REPO_ROOT = Path(__file__).parent.parent.parent
_OUTPUT_DIR = _REPO_ROOT / "data_gen" / "output"
_CACHE_DIR = _REPO_ROOT / "data_gen" / "llm" / "cache"


def generate_unstructured(
    spines=None,
    output_dir: Path | None = None,
    cache_dir: Path | None = None,
) -> dict:
    """
    Generate all unstructured documents (Slack, email, Docs, PDF) for both accounts.

    Creates output directories for all 8 modules, calls all 4 generators in sequence,
    writes manifest.json, and returns the merged manifest dict.

    Args:
        spines: List of AccountSpine instances. Defaults to [NORTHWIND_SPINE, MERIDIAN_SPINE].
        output_dir: Root output dir. Defaults to data_gen/output/.
        cache_dir: LLM cache dir. Defaults to data_gen/llm/cache/.

    Returns:
        manifest: dict of {file_name: metadata}
    """
    if spines is None:
        from data_gen.spine.spine_northwind import NORTHWIND_SPINE
        from data_gen.spine.spine_meridian import MERIDIAN_SPINE
        spines = [NORTHWIND_SPINE, MERIDIAN_SPINE]

    if output_dir is None:
        output_dir = _OUTPUT_DIR
    if cache_dir is None:
        cache_dir = _CACHE_DIR

    # Create all 8 module output directories idempotently
    for module in MODULE_NAMES:
        (output_dir / "unstructured" / module).mkdir(parents=True, exist_ok=True)

    manifest: dict = {}
    manifest.update(generate_slack(spines, output_dir, cache_dir))
    manifest.update(generate_emails(spines, output_dir, cache_dir))
    manifest.update(generate_docs(spines, output_dir, cache_dir))
    manifest.update(generate_pdfs(spines, output_dir, cache_dir))

    # Write manifest.json
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, default=str),
        encoding="utf-8",
    )

    return manifest
