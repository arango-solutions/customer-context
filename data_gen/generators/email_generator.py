"""
Email .txt generator.

Generates email thread documents for each DocEvent with a _email module.
Output format is .txt with an email-header block (From:/To:/Subject:/Body:).
No .eml files (D-05 / AutoGraph eml-skip guard).

D-02 fence: all hard facts (dates, names, entity_ids) come from the spine.
The LLM only fills prose fields.
D-09: role and questions_served live in manifest only; not in file content.
"""

from pathlib import Path

from data_gen.llm.prose_client import generate_prose
from data_gen.llm.schemas import EmailProse
from data_gen.spine.event_spine import AccountSpine, DocEvent

# Path to Jinja2 templates
_TEMPLATE_DIR = Path(__file__).parent.parent / "llm" / "prompt_templates"
_SIGNAL_TEMPLATE = str(_TEMPLATE_DIR / "email_signal.j2")
_NOISE_TEMPLATE = str(_TEMPLATE_DIR / "email_noise.j2")

# Prohibited terms for noise docs (Pitfall 4 guard)
_MERIDIAN_EMAIL_PROHIBITED = [
    "escalation", "at risk", "competitor", "silent", "quota",
    "partnership health", "unresolved", "disengaged", "renewal risk",
    "unlogged", "commitment",
]
_NORTHWIND_EMAIL_PROHIBITED = [
    "scale limit", "GenAI", "GraphRAG", "upsell", "whitespace",
    "capacity ceiling", "renewal risk", "at risk", "escalation",
]

_DEFAULT_CSM = "Alex Rivera"
_DEFAULT_AE = "Jordan Kim"


def _get_prohibited_terms(module: str) -> list[str]:
    if module.startswith("meridian"):
        return _MERIDIAN_EMAIL_PROHIBITED
    return _NORTHWIND_EMAIL_PROHIBITED


def _find_sender_recipient(spine: AccountSpine, doc: DocEvent) -> tuple[str, str]:
    """Determine sender and recipient based on doc signal type."""
    contacts = spine.contacts

    # Find champion and economic buyer
    champion = next(
        (c for c in contacts if c.role == "champion"), None
    )
    econ_buyer = next(
        (c for c in contacts if c.role == "economic_buyer"), None
    )

    if "Q9" in doc.questions_served:
        # Email to/from the champion who is going quiet
        sender = _DEFAULT_CSM
        recipient = champion.full_name if champion else "the champion contact"
    elif "Q8" in doc.questions_served:
        # AE email committing to feature timeline
        sender = _DEFAULT_AE
        recipient = champion.full_name if champion else "the champion contact"
    elif "Q12" in doc.questions_served or "Q2" in doc.questions_served:
        # Exec-to-exec or CSM escalation
        sender = _DEFAULT_CSM
        recipient = econ_buyer.full_name if econ_buyer else "the executive sponsor"
    elif "Q5" in doc.questions_served:
        # Michael Torres (CTO/economic buyer) sending GenAI intent email
        sender = econ_buyer.full_name if econ_buyer else _DEFAULT_AE
        recipient = _DEFAULT_AE
    else:
        # Default: CSM to champion
        sender = _DEFAULT_CSM
        recipient = champion.full_name if champion else "the primary contact"

    return sender, recipient


def _derive_concern_description(doc: DocEvent, spine: AccountSpine) -> str:
    """Build concern description from doc metadata."""
    if "Q12" in doc.questions_served:
        return (
            "recent operational concerns and negative feedback from the account team, "
            "despite strong usage metrics — a contradiction requiring executive attention"
        )
    if "Q2" in doc.questions_served:
        return (
            "renewal negotiations that have stalled due to unresolved service concerns "
            "and pricing objections from the customer executive team"
        )
    if "Q9" in doc.questions_served:
        if doc.role == "signal":
            return (
                "the champion contact's decreasing responsiveness and engagement over "
                "recent months, with communication now routed through a less-engaged proxy"
            )
        else:
            return "previous high engagement and active participation in product planning sessions"
    if "Q8" in doc.questions_served:
        return (
            "a specific feature delivery commitment made verbally to the customer "
            "that has not yet been logged in the CRM or formally tracked"
        )
    if "Q5" in doc.questions_served:
        return (
            "the company's strategic intent to expand into AI/ML workloads using graph "
            "capabilities, and the need to evaluate additional product options"
        )
    return "routine account management and partnership health"


def _derive_subject_context(doc: DocEvent) -> str:
    slug = doc.event_id.lower()
    if "exec" in slug:
        return "executive account review and partnership status"
    if "renewal" in slug:
        return "upcoming contract renewal discussion"
    if "champion" in slug:
        return "key stakeholder engagement"
    if "promise" in slug or "commit" in slug:
        return "feature roadmap and delivery commitments"
    if "genai" in slug or "intent" in slug:
        return "strategic platform expansion inquiry"
    if "welcome" in slug or "onboarding" in slug:
        return "customer onboarding and initial setup"
    if "qbr" in slug or "recap" in slug:
        return "quarterly business review follow-up"
    if "product" in slug or "webinar" in slug:
        return "product update and feature announcement"
    if "support" in slug:
        return "support case resolution update"
    if "license" in slug or "confirm" in slug:
        return "license renewal confirmation"
    if "anniversary" in slug:
        return "partnership anniversary and relationship update"
    if "roadmap" in slug:
        return "product roadmap sharing session"
    return "account communication and update"


def _derive_noise_topic(doc: DocEvent) -> str:
    slug = doc.event_id.lower()
    if "welcome" in slug or "onboarding" in slug:
        return "new customer welcome and onboarding overview"
    if "qbr" in slug or "recap" in slug:
        return "quarterly business review summary and highlights"
    if "license" in slug or "confirm" in slug or "renewal" in slug:
        return "contract renewal confirmation and next steps"
    if "webinar" in slug or "product" in slug:
        return "upcoming product webinar invitation"
    if "support" in slug:
        return "support ticket closure notification"
    if "check" in slug or "routine" in slug:
        return "routine quarterly check-in"
    if "anniversary" in slug or "partnership" in slug:
        return "partnership milestone celebration"
    if "roadmap" in slug:
        return "product roadmap update and upcoming features"
    return "routine account management update"


def _format_email_txt(
    doc: DocEvent,
    prose: EmailProse,
    sender: str,
    recipient: str,
    date_str: str,
) -> str:
    """
    Format the email as a .txt file with standard email headers.

    D-09: role and questions_served are NOT in the file content.
    """
    header = (
        f"<!-- module={doc.module} account_id={doc.account_id} "
        f"entity_id={doc.entity_id} citable_url={doc.citable_url} -->\n\n"
    )

    body_text = "\n\n".join(prose.body_paragraphs)

    email_text = (
        f"From: {sender}\n"
        f"To: {recipient}\n"
        f"Date: {date_str}\n"
        f"Subject: {prose.subject}\n\n"
        f"{prose.greeting}\n\n"
        f"{body_text}\n\n"
        f"{prose.closing}\n"
        f"{sender}\n"
    )

    return header + email_text


def generate_emails(
    spines: list[AccountSpine],
    output_dir: Path,
    cache_dir: Path,
) -> dict:
    """
    Generate email .txt files for all DocEvents with a _email module.

    Args:
        spines: List of AccountSpine instances
        output_dir: Root output directory
        cache_dir: LLM response cache directory

    Returns:
        manifest: dict keyed by file_name
    """
    manifest: dict = {}

    for spine in spines:
        for doc in spine.docs:
            if not doc.module.endswith("_email"):
                continue

            module_dir = output_dir / "unstructured" / doc.module
            module_dir.mkdir(parents=True, exist_ok=True)

            date_str = doc.event_date.strftime("%B %Y")
            sender, recipient = _find_sender_recipient(spine, doc)

            if doc.role in ("signal", "near-miss"):
                concern_description = _derive_concern_description(doc, spine)
                subject_context = _derive_subject_context(doc)
                facts = {
                    "account_name": spine.account_name,
                    "sender_name": sender,
                    "recipient_name": recipient,
                    "date": date_str,
                    "subject_context": subject_context,
                    "concern_description": concern_description,
                    "prohibited_terms": _get_prohibited_terms(doc.module),
                }
                prose = generate_prose(
                    template_path=_SIGNAL_TEMPLATE,
                    facts=facts,
                    output_schema=EmailProse,
                    cache_dir=cache_dir,
                )
            else:
                topic = _derive_noise_topic(doc)
                facts = {
                    "account_name": spine.account_name,
                    "sender_name": sender,
                    "recipient_name": recipient,
                    "date": date_str,
                    "topic": topic,
                    "prohibited_terms": _get_prohibited_terms(doc.module),
                }
                prose = generate_prose(
                    template_path=_NOISE_TEMPLATE,
                    facts=facts,
                    output_schema=EmailProse,
                    cache_dir=cache_dir,
                )

            content = _format_email_txt(doc, prose, sender, recipient, date_str)
            out_path = module_dir / doc.file_name
            out_path.write_text(content, encoding="utf-8")

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
