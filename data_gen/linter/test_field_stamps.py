"""
Field stamp checks for generated unstructured documents.

Validates:
- Required fields (module, account_id, entity_id, citable_url) present and non-empty
- Module names are from the locked 8-module set
- citable_url prefix is "https://arangodb.com/demo/"
- PDFs are openable and text-extractable by both pdfplumber and PyMuPDF (fitz)
- Signal PDFs have their key content within the first 4500 chars (AutoGraph truncation guard)
"""

from pathlib import Path

import pytest

from data_gen.linter.conftest import MODULE_NAMES, REPO_ROOT


REQUIRED_FIELDS = ["module", "account_id", "entity_id", "citable_url"]
CITABLE_URL_PREFIX = "https://arangodb.com/demo/"
AUTOFORMAT_CHAR_BUDGET = 4500  # AutoGraph CHUNK_MAX_CHARS is 4800; keep margin


# ---------------------------------------------------------------------------
# Required-field checks (parametrized)
# ---------------------------------------------------------------------------


def test_required_fields_present(load_manifest):
    """
    Every manifest entry must have module, account_id, entity_id, and
    citable_url as non-empty strings.

    Parametrized over every file_name in the manifest. If any field is missing
    or empty, the doc cannot be used for cross-graph sourcing.
    """
    violations = []
    for file_name, meta in load_manifest.items():
        for field in REQUIRED_FIELDS:
            value = meta.get(field, "")
            if not value or not str(value).strip():
                violations.append(
                    f"{file_name!r}: field={field!r} is missing or empty (got {value!r})"
                )

    assert not violations, (
        f"Required field violations ({len(violations)}):\n" + "\n".join(violations)
    )


def test_module_names_valid(load_manifest):
    """
    Every manifest entry's module must be one of the 8 locked MODULE_NAMES.

    A module name mismatch (e.g. underscore vs. dash) would cause the
    Phase 3 AutoGraph import to place docs in the wrong bucket, breaking
    the deterministic keying by (module, file_name).
    """
    violations = []
    for file_name, meta in load_manifest.items():
        module = meta.get("module", "")
        if module not in MODULE_NAMES:
            violations.append(
                f"{file_name!r}: module={module!r} is not in MODULE_NAMES={MODULE_NAMES}"
            )

    assert not violations, (
        f"Invalid module names ({len(violations)}):\n" + "\n".join(violations)
    )


def test_citable_url_prefix(load_manifest):
    """
    Every citable_url must start with "https://arangodb.com/demo/".

    This guards against accidentally using a real customer URL as a citable_url,
    which would expose PII or create confusion in sourcing output. The demo
    namespace is synthetic and clearly identifiable.
    """
    violations = []
    for file_name, meta in load_manifest.items():
        url = meta.get("citable_url", "")
        if not url.startswith(CITABLE_URL_PREFIX):
            violations.append(
                f"{file_name!r}: citable_url={url!r} does not start with "
                f"{CITABLE_URL_PREFIX!r}"
            )

    assert not violations, (
        f"citable_url prefix violations ({len(violations)}):\n" + "\n".join(violations)
    )


# ---------------------------------------------------------------------------
# PDF extractability checks
# ---------------------------------------------------------------------------


def test_pdfs_extractable(load_manifest, load_unstructured_files):
    """
    For each .pdf file in the unstructured output, assert that:
    1. pdfplumber can open the file and extract text.
    2. fitz (PyMuPDF) can open the file and extract text.

    Belt-and-suspenders: AutoGraph uses pdfplumber; we also check fitz to
    confirm the PDF is well-formed enough for the Phase 3 extraction step.
    """
    import pdfplumber
    import fitz  # PyMuPDF

    pdf_files = [p for p in load_unstructured_files if p.suffix.lower() == ".pdf"]
    if not pdf_files:
        pytest.skip("No PDF files found in unstructured output")

    violations = []
    for pdf_path in pdf_files:
        # pdfplumber check
        try:
            with pdfplumber.open(pdf_path) as pdf:
                text = "".join(page.extract_text() or "" for page in pdf.pages)
            if not text.strip():
                violations.append(
                    f"{pdf_path.name}: pdfplumber extracted empty text"
                )
        except Exception as exc:
            violations.append(f"{pdf_path.name}: pdfplumber failed to open — {exc}")

        # PyMuPDF check
        try:
            doc = fitz.open(str(pdf_path))
            fitz_text = "".join(page.get_text() for page in doc)
            doc.close()
            if not fitz_text.strip():
                violations.append(
                    f"{pdf_path.name}: fitz (PyMuPDF) extracted empty text"
                )
        except Exception as exc:
            violations.append(f"{pdf_path.name}: fitz (PyMuPDF) failed to open — {exc}")

    assert not violations, (
        f"PDF extractability failures ({len(violations)}):\n" + "\n".join(violations)
    )


def test_signal_pdf_facts_in_first_4500_chars(load_manifest, load_unstructured_files):
    """
    For each signal .pdf (role="signal" in manifest), assert that:
    - pdfplumber extracts at least 1 character (non-empty)
    - The extracted text from page 1 alone is <= 4500 characters

    This guards against AutoGraph's CHUNK_MAX_CHARS truncation (Pitfall 3):
    if the key signal content is on page 2 or beyond the 4800-char budget,
    it will be silently dropped from the Layer-2 embedding/clustering step.
    Keeping signal content within 4500 chars on page 1 provides a safety margin.
    """
    import pdfplumber

    # Build a lookup from file_name → full path
    file_lookup: dict = {p.name: p for p in load_unstructured_files}

    signal_pdfs = [
        (file_name, meta)
        for file_name, meta in load_manifest.items()
        if meta.get("role") == "signal" and file_name.lower().endswith(".pdf")
    ]

    if not signal_pdfs:
        pytest.skip("No signal PDF files found in manifest")

    violations = []
    for file_name, meta in signal_pdfs:
        pdf_path = file_lookup.get(file_name)
        if pdf_path is None:
            violations.append(f"{file_name!r}: file not found in unstructured output")
            continue

        try:
            with pdfplumber.open(pdf_path) as pdf:
                if not pdf.pages:
                    violations.append(f"{file_name!r}: PDF has no pages")
                    continue

                page1_text = pdf.pages[0].extract_text() or ""
                total_text = "".join(page.extract_text() or "" for page in pdf.pages)

                if not total_text.strip():
                    violations.append(f"{file_name!r}: signal PDF has empty extracted text")
                    continue

                # For single-page PDFs, check total length; for multi-page, check page 1
                check_length = (
                    len(total_text)
                    if len(pdf.pages) == 1
                    else len(page1_text)
                )

                if check_length > AUTOFORMAT_CHAR_BUDGET:
                    violations.append(
                        f"{file_name!r}: signal PDF page-1 text is {check_length} chars "
                        f"(> {AUTOFORMAT_CHAR_BUDGET} budget); key signal may be truncated by AutoGraph"
                    )

        except Exception as exc:
            violations.append(f"{file_name!r}: pdfplumber error — {exc}")

    assert not violations, (
        f"Signal PDF truncation-risk violations ({len(violations)}):\n"
        + "\n".join(violations)
    )
