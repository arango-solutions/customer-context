"""
Slack thread .txt generator.

Generates Slack-style conversation threads for each DocEvent in the spine
where module ends with "_slack". Uses generate_prose for signal/near-miss
content; applies the same LLM path for noise with prohibited_terms to
prevent accidental signal leakage (Pitfall 4).

D-02 fence: all hard facts (dates, names, entity_ids) come from the spine.
The LLM only fills prose fields.
D-05: output is .txt (no .eml).
D-09: role and questions_served live in manifest only; not in file content.
"""

from pathlib import Path

from data_gen.llm.prose_client import generate_prose
from data_gen.llm.schemas import SlackMessageProse
from data_gen.spine.event_spine import AccountSpine, DocEvent

# Path to Jinja2 templates
_TEMPLATE_DIR = Path(__file__).parent.parent / "llm" / "prompt_templates"
_SIGNAL_TEMPLATE = str(_TEMPLATE_DIR / "slack_signal.j2")
_NOISE_TEMPLATE = str(_TEMPLATE_DIR / "slack_noise.j2")

# Prohibited terms for noise docs (Pitfall 4 guard — per-module signal vocab)
_MERIDIAN_SLACK_PROHIBITED = [
    "escalation", "at risk", "competitor", "silent", "quota",
    "partnership health", "unresolved", "red flag", "disengaged",
]
_NORTHWIND_SLACK_PROHIBITED = [
    "scale limit", "GenAI", "GraphRAG", "upsell", "whitespace",
    "capacity", "renewal risk", "at risk", "escalation",
]
# Helio noise-only prohibitions: EXCLUDE the contraction/churn signal vocabulary
# (downgrade/contraction/migration/declining/churn/deprioritization) so that helio
# signal docs keep their lexicon. Without a real helio branch, helio_slack would
# fall through to _NORTHWIND_SLACK_PROHIBITED and strip Helio's churn signal terms.
_HELIO_SLACK_PROHIBITED = [
    "escalation", "competitor", "silent", "quota",
    "red flag", "disengaged", "unresolved",
]

# Default CSM name used when no contact is available
_DEFAULT_CSM = "Alex Rivera"


def _get_prohibited_terms(module: str, doc: DocEvent) -> list[str]:
    """Return prohibited_terms for this doc's module."""
    if module == "meridian_slack":
        return _MERIDIAN_SLACK_PROHIBITED
    if module == "helio_slack":
        return _HELIO_SLACK_PROHIBITED
    return _NORTHWIND_SLACK_PROHIBITED


def _build_facts_for_signal(
    spine: AccountSpine,
    doc: DocEvent,
    concern_topic: str,
    champion_name: str,
) -> dict:
    """Build facts dict for signal/near-miss Slack documents."""
    # Find most recent contact from spine for CSM name
    csm_name = _DEFAULT_CSM
    for contact in spine.contacts:
        if contact.role == "champion" and contact.active_to is None:
            csm_name = contact.full_name
            break

    # last_contact_date: use event_date as a context string (not a spine-derived ISO date)
    last_contact_date_str = doc.event_date.strftime("%B %Y")

    return {
        "account_name": spine.account_name,
        "csm_name": csm_name,
        "date": doc.event_date.strftime("%B %Y"),
        "concern_topic": concern_topic,
        "champion_name": champion_name,
        "last_contact_date": last_contact_date_str,
        "prohibited_terms": _get_prohibited_terms(doc.module, doc),
    }


def _build_facts_for_noise(spine: AccountSpine, doc: DocEvent, topic: str) -> dict:
    """Build facts dict for noise Slack documents."""
    participant_names = [c.full_name for c in spine.contacts[:2]]
    if not participant_names:
        participant_names = [_DEFAULT_CSM]
    return {
        "account_name": spine.account_name,
        "topic": topic,
        "date": doc.event_date.strftime("%B %Y"),
        "participant_names": participant_names,
        "prohibited_terms": _get_prohibited_terms(doc.module, doc),
    }


def _derive_concern_topic(doc: DocEvent) -> str:
    """Derive a concern topic description from the DocEvent metadata."""
    if "Q12" in doc.questions_served:
        return (
            "operational concerns and partnership health flagged by the engineering "
            "leadership team during the latest QBR — service-reliability complaints and "
            "a frustrated tone from the Director of Engineering that sit in sharp tension "
            "with the consistently green, quarter-over-quarter-growing usage metrics, a "
            "contradiction the CSM is escalating for executive review"
        )
    if "Q2" in doc.questions_served:
        return (
            "renewal risk on the upcoming Enterprise contract: the ~$190K renewal is "
            "stalled in negotiation while the customer raises pricing objections and "
            "unresolved service concerns, and the CFO has not yet signed off — the CSM "
            "wants the account team aligned on the specific blockers before the renewal date"
        )
    if "Q9" in doc.questions_served:
        return (
            "a decline in champion engagement: the primary technical champion (Director of "
            "Engineering) has gone notably quiet over recent quarters, with outreach now "
            "routed through a less-senior Engineering Manager proxy who has less context, "
            "fewer action items per meeting, and slower response times than in prior years"
        )
    if "Q5" in doc.questions_served:
        return (
            "ArangoGraph cluster scale limits as monthly query volume approaches the "
            "current node ceiling, and the team's stated readiness to evaluate the GenAI / "
            "GraphRAG suite — a clear expansion-whitespace signal the CSM wants to convert "
            "into the upcoming renewal-and-upsell conversation"
        )
    if "Q8" in doc.questions_served:
        return (
            "a specific feature-delivery commitment the account executive made verbally to "
            "the customer that was never logged in the CRM, creating an expectation-management "
            "gap between what the customer believes was promised and what is formally tracked"
        )
    if "Q13" in doc.questions_served:
        return (
            "declining usage and a plan downgrade, with the team discussing a "
            "migration-away from the graph platform and the contraction in adoption"
        )
    if "Q14" in doc.questions_served:
        return (
            "a remediation / save-plan to halt the account contraction and "
            "re-engage the team before the at-risk renewal"
        )
    return "account update requiring follow-up"


def _derive_champion_name(spine: AccountSpine, doc: DocEvent) -> str:
    """Find the champion contact name from the spine."""
    for contact in spine.contacts:
        if contact.role == "champion":
            return contact.full_name
    return "the account champion"


def _derive_noise_topic(doc: DocEvent) -> str:
    """Derive a routine topic from the event_id slug."""
    slug = doc.event_id.lower()
    if "onboarding" in slug or "welcome" in slug:
        return "customer onboarding progress"
    if "deploy" in slug or "checklist" in slug:
        return "deployment status update"
    if "qbr" in slug:
        return "quarterly business review preparation"
    if "smartgraph" in slug or "feature" in slug or "enterprise" in slug:
        return "product feature enablement"
    if "support" in slug or "case" in slug or "ack" in slug:
        return "support case resolution"
    if "renewal" in slug or "thanks" in slug or "confirm" in slug:
        return "renewal confirmation and account health"
    if "product" in slug or "changelog" in slug or "release" in slug:
        return "product update and release notes"
    if "cluster" in slug or "health" in slug:
        return "cluster health and performance monitoring"
    if "migration" in slug:
        return "migration planning and execution"
    if "training" in slug or "kickoff" in slug:
        return "team training and onboarding progress"
    if "growth" in slug or "sizing" in slug:
        return "cluster sizing and capacity planning"
    if "positive" in slug or "prep" in slug:
        return "account satisfaction and QBR preparation"
    if "near_miss" in slug or "near-miss" in slug:
        return "account check-in and status update"
    return "routine account management update"


def _format_slack_thread(
    doc: DocEvent,
    prose: SlackMessageProse,
    spine: AccountSpine,
    date_str: str,
) -> str:
    """
    Format the Slack thread as a .txt file with metadata header.

    D-09: role and questions_served are NOT in the file content.
    """
    csm_name = _DEFAULT_CSM
    for contact in spine.contacts:
        if contact.role == "champion" and contact.active_to is None:
            csm_name = contact.full_name
            break

    # Metadata comment header (D-04 / Pattern 4)
    header = (
        f"<!-- module={doc.module} account_id={doc.account_id} "
        f"entity_id={doc.entity_id} citable_url={doc.citable_url} -->\n\n"
    )

    # Slack thread format
    thread = (
        f"[{date_str}] {csm_name}: {prose.opening_line}\n\n"
        f"[{date_str}] {csm_name}: {prose.body_paragraph}\n\n"
        f"[{date_str}] {csm_name}: {prose.closing_line}\n"
    )

    return header + thread


def generate_slack(
    spines: list[AccountSpine],
    output_dir: Path,
    cache_dir: Path,
) -> dict:
    """
    Generate Slack .txt files for all DocEvents in the spine with a _slack module.

    Args:
        spines: List of AccountSpine instances (Northwind + Meridian)
        output_dir: Root output directory (data_gen/output/)
        cache_dir: LLM response cache directory

    Returns:
        manifest: dict of {file_name: {module, account_id, entity_id, citable_url,
                                       role, questions_served, spine_events, event_date}}
    """
    manifest: dict = {}

    for spine in spines:
        for doc in spine.docs:
            if not doc.module.endswith("_slack"):
                continue

            # Ensure output directory exists
            module_dir = output_dir / "unstructured" / doc.module
            module_dir.mkdir(parents=True, exist_ok=True)

            date_str = doc.event_date.strftime("%B %Y")

            if doc.role == "signal":
                concern_topic = _derive_concern_topic(doc)
                champion_name = _derive_champion_name(spine, doc)
                facts = _build_facts_for_signal(spine, doc, concern_topic, champion_name)
                prose = generate_prose(
                    template_path=_SIGNAL_TEMPLATE,
                    facts=facts,
                    output_schema=SlackMessageProse,
                    cache_dir=cache_dir,
                )
            else:
                # Near-miss and noise: use noise template so near-miss stubs have positive
                # content (a prior successful period) that differs from signal stubs.
                # Without a live LLM the stub fallback makes signal and near-miss identical
                # if both use the signal template — this is the near-miss guard fix (plan 02-05).
                topic = _derive_noise_topic(doc)
                facts = _build_facts_for_noise(spine, doc, topic)
                prose = generate_prose(
                    template_path=_NOISE_TEMPLATE,
                    facts=facts,
                    output_schema=SlackMessageProse,
                    cache_dir=cache_dir,
                )

            content = _format_slack_thread(doc, prose, spine, date_str)
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
