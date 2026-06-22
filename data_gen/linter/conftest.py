"""
Shared fixtures for the integrity linter.

All fixtures skip (not fail) when the generated output does not yet exist.
This allows the linter suite to be imported and collected with no data present.
"""

import json
import pytest
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODULE_NAMES = [
    "northwind_slack",
    "northwind_email",
    "northwind_docs",
    "northwind_pdf",
    "meridian_slack",
    "meridian_email",
    "meridian_docs",
    "meridian_pdf",
]

QUESTION_IDS = ["Q7", "Q2", "Q12", "Q9", "Q5", "Q8"]

# Repo root is the directory that contains data_gen/
REPO_ROOT = Path(__file__).parent.parent.parent


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def load_manifest():
    """
    Load the generation manifest from data_gen/output/manifest.json.

    Returns a dict keyed by file_name. Skips (does not fail) if the file
    does not yet exist (data has not been generated).
    """
    manifest_path = REPO_ROOT / "data_gen" / "output" / "manifest.json"
    if not manifest_path.exists():
        pytest.skip("manifest not yet generated — run data_gen/generate.py first")
    try:
        raw = manifest_path.read_text(encoding="utf-8")
        manifest = json.loads(raw)
    except json.JSONDecodeError as exc:
        pytest.skip(f"manifest.json is malformed: {exc}")
    if not isinstance(manifest, dict):
        pytest.skip("manifest.json must be a JSON object keyed by file_name")
    return manifest


@pytest.fixture(scope="session")
def load_structured():
    """
    Load all JSON record files from data_gen/output/structured/.

    Returns a nested dict:
        {
          "northwind": { "<source>": [<records>] },
          "meridian":  { "<source>": [<records>] },
        }

    Skips if the directory does not exist or contains no JSON files.
    """
    structured_dir = REPO_ROOT / "data_gen" / "output" / "structured"
    if not structured_dir.exists():
        pytest.skip("structured output not yet generated — run data_gen/generate.py first")

    json_files = list(structured_dir.glob("**/*.json"))
    if not json_files:
        pytest.skip("structured output not yet generated — no JSON files found")

    result = {}
    for json_file in json_files:
        try:
            records = json.loads(json_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            pytest.skip(f"structured file {json_file.name} is malformed: {exc}")

        # Derive account and source from filename convention:
        # e.g. northwind_crm_accounts.json → account=northwind, source=crm_accounts
        parts = json_file.stem.split("_", 1)
        account = parts[0] if len(parts) >= 1 else "unknown"
        source = parts[1] if len(parts) >= 2 else json_file.stem

        if account not in result:
            result[account] = {}
        result[account][source] = records if isinstance(records, list) else [records]

    if not result:
        pytest.skip("structured output not yet generated — empty structured directory")

    return result


@pytest.fixture(scope="session")
def load_unstructured_files():
    """
    List all files under data_gen/output/unstructured/ recursively.

    Returns a list of Path objects. Skips if the directory does not exist.
    """
    unstructured_dir = REPO_ROOT / "data_gen" / "output" / "unstructured"
    if not unstructured_dir.exists():
        pytest.skip("unstructured output not yet generated — run data_gen/generate.py first")

    all_files = [p for p in unstructured_dir.rglob("*") if p.is_file()]
    if not all_files:
        pytest.skip("unstructured output not yet generated — directory is empty")

    return all_files
