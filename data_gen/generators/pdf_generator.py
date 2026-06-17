"""
PDF generator for EBR decks, contracts, and ROI reports.

Generates PDF files for each DocEvent with a _pdf module.
Uses fpdf2 (FPDF class) for pure-Python PDF creation.

Critical constraints:
- Signal PDFs: key signal sentence must appear within first 4,500 characters
  of extracted text (AutoGraph truncation guard — Pitfall 3)
- D-02 fence: hard facts injected from spine; LLM fills prose only
- D-09: role / questions_served live in manifest only; not in PDF content

PDF text is kept concise for signal docs (page-1 budget guard).
Noise docs can be multi-page.
"""

import io
import warnings
from pathlib import Path

from fpdf import FPDF

from data_gen.llm.prose_client import generate_prose
from data_gen.llm.schemas import PdfSectionProse
from data_gen.spine.event_spine import AccountSpine, DocEvent

# Signal template reuses docs_signal (PDF also has headline/findings structure)
_TEMPLATE_DIR = Path(__file__).parent.parent / "llm" / "prompt_templates"
_SIGNAL_TEMPLATE = str(_TEMPLATE_DIR / "docs_signal.j2")
_NOISE_TEMPLATE = str(_TEMPLATE_DIR / "docs_noise.j2")

# AutoGraph 4500-char page-1 budget (with 300-char safety margin)
_PAGE1_CHAR_BUDGET = 4500
_PAGE1_WARN_AT = 4200  # warn before hitting the limit

# Prohibited terms for noise PDFs
_MERIDIAN_PDF_PROHIBITED = [
    "red annotation", "partnership health", "at risk", "escalation",
    "competitor", "disengaged", "renewal risk", "unresolved",
]
_NORTHWIND_PDF_PROHIBITED = [
    "scale limit", "GenAI intent", "GraphRAG", "whitespace", "at risk",
    "escalation", "capacity ceiling",
]


def _get_prohibited_terms(module: str) -> list[str]:
    if module.startswith("meridian"):
        return _MERIDIAN_PDF_PROHIBITED
    return _NORTHWIND_PDF_PROHIBITED


def _derive_doc_type(doc: DocEvent) -> str:
    slug = doc.event_id.lower()
    if "ebr" in slug:
        return "Executive Business Review"
    if "roi" in slug:
        return "ROI Report"
    if "contract" in slug:
        return "Contract Summary"
    if "usage" in slug:
        return "Usage Report"
    return "Account Report"


def _derive_event_summary(doc: DocEvent, spine: AccountSpine) -> str:
    """Signal PDF event summary."""
    if "Q12" in doc.questions_served:
        return (
            "EBR deck revealing a risk slide: partnership health is at risk "
            "despite strong usage growth — the contradiction between green metrics "
            "and red partnership signals requires executive review"
        )
    if "Q8" in doc.questions_served:
        return (
            "EBR next-steps slide referencing a specific feature delivery commitment "
            "that was verbally made to the customer but not logged in formal tracking systems"
        )
    return "Account business review highlighting key metrics and partnership status"


def _derive_key_facts(doc: DocEvent, spine: AccountSpine) -> list[str]:
    """Generate key facts list for signal PDF."""
    facts = []
    if "Q12" in doc.questions_served:
        facts.append("Usage growth: consistent positive trend across all tracked periods")
        facts.append("NPS verbatim: negative sentiment expressed in recent survey comments")
        facts.append("Partnership health: at risk — operational concerns unaddressed")
        facts.append("Recommendation: immediate executive outreach and account review")
    if "Q8" in doc.questions_served:
        facts.append("Feature delivery commitment referenced in customer meeting")
        facts.append("Commitment status: not formally logged in CRM")
        facts.append("Customer expectation: feature delivery as discussed verbally")
        facts.append("Action required: formalize commitment tracking immediately")
    if not facts:
        facts = ["Performance metrics: on track", "Account status: healthy"]
    return facts


def _derive_noise_topic(doc: DocEvent) -> str:
    slug = doc.event_id.lower()
    if "roi" in slug:
        return "return on investment analysis and productivity gains"
    if "ebr" in slug:
        return "executive business review highlights and achievements"
    if "contract" in slug:
        return "contract summary and service level overview"
    if "usage" in slug:
        return "usage metrics and growth trends"
    return "account performance and partnership health overview"


def _ascii_safe(text: str) -> str:
    """
    Replace common Unicode characters not supported by fpdf2 built-in Helvetica font.

    fpdf2's built-in fonts are Latin-1 encoded. Characters outside Latin-1 (e.g.
    em dash U+2014, left/right quotes) must be replaced with ASCII equivalents to
    avoid FPDFUnicodeEncodingException.
    """
    replacements = {
        "—": "-",   # em dash
        "–": "-",   # en dash
        "‘": "'",   # left single quote
        "’": "'",   # right single quote
        "“": '"',   # left double quote
        "”": '"',   # right double quote
        "…": "...", # ellipsis
        "â": "-",  # UTF-8 em dash as 3 bytes
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    # Final safety: drop any remaining non-Latin-1 chars
    return text.encode("latin-1", errors="replace").decode("latin-1")


_PAGE_WIDTH_MM = 190  # A4 width (210mm) minus 2x10mm margins


class _PDF(FPDF):
    """Custom FPDF subclass with standard header for Customer 360 docs."""

    def __init__(self, account_name: str, doc_type: str, date_str: str):
        super().__init__()
        self.set_margins(10, 10, 10)
        self._account_name = account_name
        self._doc_type = doc_type
        self._date_str = date_str

    def header(self):
        self.set_font("Helvetica", "B", 14)
        # Use ASCII hyphen-minus to avoid Unicode encoding issues with built-in fonts
        title = _ascii_safe(f"{self._doc_type} - {self._account_name}")
        self.cell(_PAGE_WIDTH_MM, 10, title, ln=True)
        self.set_font("Helvetica", "", 10)
        self.cell(_PAGE_WIDTH_MM, 8, f"Period: {self._date_str}", ln=True)
        self.ln(4)


def _estimate_text_chars(pdf: FPDF, text: str) -> int:
    """Rough estimate of rendered character count for a text block."""
    return len(text)


def _write_signal_pdf(
    doc: DocEvent,
    prose: PdfSectionProse,
    spine: AccountSpine,
    date_str: str,
    doc_type: str,
    out_path: Path,
) -> None:
    """
    Write a signal PDF with key signal content on page 1.

    Signal fact must appear in first 4,500 chars (AutoGraph truncation guard).
    """
    pdf = _PDF(spine.account_name, doc_type, date_str)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 12)

    # Headline (key signal sentence must be here on page 1)
    pdf.multi_cell(_PAGE_WIDTH_MM, 8, _ascii_safe(prose.headline))
    pdf.ln(4)

    pdf.set_font("Helvetica", "", 11)
    # Narrative paragraph (contains the signal context)
    pdf.multi_cell(_PAGE_WIDTH_MM, 7, _ascii_safe(prose.narrative_paragraph))
    pdf.ln(4)

    # Key findings (bullet points)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(_PAGE_WIDTH_MM, 8, "Key Findings:", ln=True)
    pdf.set_font("Helvetica", "", 11)
    for finding in prose.key_findings:
        pdf.multi_cell(_PAGE_WIDTH_MM, 7, _ascii_safe(f"- {finding}"))
    pdf.ln(4)

    # For Q12/Q8 — add the signal phrase explicitly to ensure it is present
    if "Q12" in doc.questions_served:
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(_PAGE_WIDTH_MM, 8, "Partnership health: at risk")
        pdf.set_font("Helvetica", "", 11)
    if "Q8" in doc.questions_served:
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(_PAGE_WIDTH_MM, 8, "Note: Feature commitment made verbally - not logged in CRM")
        pdf.set_font("Helvetica", "", 11)

    # Write to file
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))

    # Verify page-1 char budget
    try:
        import pdfplumber
        with pdfplumber.open(str(out_path)) as plumber_pdf:
            p1_text = plumber_pdf.pages[0].extract_text() or ""
            char_count = len(p1_text)
            if char_count > _PAGE1_WARN_AT:
                warnings.warn(
                    f"Signal PDF {out_path.name} page-1 text is {char_count} chars "
                    f"(warn threshold {_PAGE1_WARN_AT}); approaching 4500-char AutoGraph limit"
                )
            if char_count > _PAGE1_CHAR_BUDGET:
                warnings.warn(
                    f"TRUNCATION RISK: Signal PDF {out_path.name} page-1 text is "
                    f"{char_count} chars (> {_PAGE1_CHAR_BUDGET} budget)"
                )
    except ImportError:
        pass  # pdfplumber not available — skip check


def _write_noise_pdf(
    doc: DocEvent,
    prose: PdfSectionProse,
    spine: AccountSpine,
    date_str: str,
    doc_type: str,
    out_path: Path,
) -> None:
    """Write a noise PDF — no length constraint."""
    pdf = _PDF(spine.account_name, doc_type, date_str)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 12)
    pdf.multi_cell(_PAGE_WIDTH_MM, 8, _ascii_safe(prose.headline))
    pdf.ln(4)

    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(_PAGE_WIDTH_MM, 7, _ascii_safe(prose.narrative_paragraph))
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(_PAGE_WIDTH_MM, 8, "Key Findings:", ln=True)
    pdf.set_font("Helvetica", "", 11)
    for finding in prose.key_findings:
        pdf.multi_cell(_PAGE_WIDTH_MM, 7, _ascii_safe(f"- {finding}"))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))


def generate_pdfs(
    spines: list[AccountSpine],
    output_dir: Path,
    cache_dir: Path,
) -> dict:
    """
    Generate PDF files for all DocEvents with a _pdf module.

    Returns:
        manifest: dict keyed by file_name
    """
    manifest: dict = {}

    for spine in spines:
        for doc in spine.docs:
            if not doc.module.endswith("_pdf"):
                continue

            module_dir = output_dir / "unstructured" / doc.module
            module_dir.mkdir(parents=True, exist_ok=True)

            date_str = doc.event_date.strftime("%B %Y")
            doc_type = _derive_doc_type(doc)

            if doc.role in ("signal", "near-miss"):
                event_summary = _derive_event_summary(doc, spine)
                key_facts = _derive_key_facts(doc, spine)
                facts = {
                    "account_name": spine.account_name,
                    "doc_type": doc_type,
                    "date": date_str,
                    "event_summary": event_summary,
                    "key_facts_list": key_facts,
                    "prohibited_terms": _get_prohibited_terms(doc.module),
                }
                prose = generate_prose(
                    template_path=_SIGNAL_TEMPLATE,
                    facts=facts,
                    output_schema=PdfSectionProse,
                    cache_dir=cache_dir,
                )
                out_path = module_dir / doc.file_name
                _write_signal_pdf(doc, prose, spine, date_str, doc_type, out_path)
            else:
                topic = _derive_noise_topic(doc)
                facts = {
                    "account_name": spine.account_name,
                    "doc_type": doc_type,
                    "date": date_str,
                    "topic": topic,
                    "prohibited_terms": _get_prohibited_terms(doc.module),
                }
                prose = generate_prose(
                    template_path=_NOISE_TEMPLATE,
                    facts=facts,
                    output_schema=PdfSectionProse,
                    cache_dir=cache_dir,
                )
                out_path = module_dir / doc.file_name
                _write_noise_pdf(doc, prose, spine, date_str, doc_type, out_path)

            manifest[doc.file_name] = {
                "module": doc.module,
                "account_id": doc.account_id,
                "entity_id": doc.entity_id,
                "citable_url": doc.citable_url,
                "role": doc.role,
                "questions_served": doc.questions_served,
                "spine_events": doc.spine_events,
                "event_date": str(doc.event_date),
            }

    return manifest
