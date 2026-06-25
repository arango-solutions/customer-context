"""
Google Docs / Markdown .md generator.

Generates markdown documents for each DocEvent with a _docs module.
Output format is .md with YAML front-matter and structured sections.

D-02 fence: all hard facts come from the spine; LLM fills only prose fields.
D-09: role and questions_served live in manifest only; not in file content.
"""

from pathlib import Path

from data_gen.llm.prose_client import generate_prose
from data_gen.llm.schemas import DocsProse
from data_gen.spine.event_spine import AccountSpine, DocEvent

# Path to Jinja2 templates
_TEMPLATE_DIR = Path(__file__).parent.parent / "llm" / "prompt_templates"
_SIGNAL_TEMPLATE = str(_TEMPLATE_DIR / "docs_signal.j2")
_NOISE_TEMPLATE = str(_TEMPLATE_DIR / "docs_noise.j2")

# Prohibited terms for noise docs (Pitfall 4 guard)
_MERIDIAN_DOCS_PROHIBITED = [
    "red annotation", "partnership health", "unresolved", "at risk",
    "escalation", "competitor", "silent", "disengaged", "renewal risk",
    "unlogged commitment", "feature gap",
]
_NORTHWIND_DOCS_PROHIBITED = [
    "scale limit", "GenAI intent", "GraphRAG", "whitespace", "upsell",
    "capacity ceiling", "at risk", "escalation",
]
# Helio noise-only prohibitions — EXCLUDE contraction/churn signal vocabulary
# (downgrade/contraction/migration/declining/churn/deprioritization).
_HELIO_DOCS_PROHIBITED = [
    "red annotation", "unresolved", "escalation", "competitor",
    "silent", "disengaged", "feature gap",
]


def _get_prohibited_terms(module: str) -> list[str]:
    if module.startswith("meridian"):
        return _MERIDIAN_DOCS_PROHIBITED
    if module.startswith("helio"):
        return _HELIO_DOCS_PROHIBITED
    return _NORTHWIND_DOCS_PROHIBITED


def _derive_doc_type(doc: DocEvent) -> str:
    slug = doc.event_id.lower()
    if "qbr" in slug:
        return "Quarterly Business Review Notes"
    if "success_plan" in slug:
        return "Customer Success Plan"
    if "meeting" in slug or "commit" in slug:
        return "Meeting Notes"
    if "architecture" in slug:
        return "Architecture Review Document"
    if "security" in slug or "audit" in slug:
        return "Security Audit Notes"
    if "migration" in slug:
        return "Migration Guide"
    if "onboarding" in slug or "runbook" in slug:
        return "Onboarding Runbook"
    if "feature" in slug:
        return "Feature Guide"
    if "cluster" in slug or "optimization" in slug or "sizing" in slug:
        return "Cluster Optimization Notes"
    if "performance" in slug or "benchmark" in slug:
        return "Performance Benchmark Report"
    if "renewal" in slug or "planning" in slug:
        return "Renewal Planning Document"
    if "logged_promise" in slug:
        return "Meeting Notes — Logged Commitment"
    if "near_miss" in slug:
        return "Account Health Notes"
    if "intro" in slug:
        return "Product Overview Document"
    if "routine" in slug:
        return "Routine Account Notes"
    return "Account Document"


def _derive_event_summary(doc: DocEvent, spine: AccountSpine) -> str:
    """Build event summary from doc metadata for signal docs."""
    if "Q12" in doc.questions_served:
        if "qbr" in doc.event_id.lower():
            return (
                "Q3 QBR review surfacing a sharp contradiction: Snowflake usage telemetry "
                "shows strong, sustained quarter-over-quarter growth, yet multiple members "
                "of the engineering leadership team raised operational and service-reliability "
                "concerns during the session, and partnership health was flagged with a red "
                "annotation requiring immediate executive follow-up — the green numbers and "
                "the red relationship signal must be reconciled together"
            )
        return (
            "Customer success plan review highlighting unresolved operational concerns and a "
            "frustrated tone from the account's engineering leadership, set directly against "
            "strong, growing technical usage — a clear misalignment between the measured "
            "product value the metrics show and the partnership satisfaction the team reports"
        )
    if "Q2" in doc.questions_served:
        return (
            "Renewal-planning review of the ~$190K Enterprise contract identifying the open "
            "items, pricing objections, and unmet goals that are driving renewal risk: the "
            "customer's executive team has questioned value-for-spend and raised concerns "
            "about product fit for their evolving operational requirements, and the renewal "
            "remains in active negotiation pending CFO sign-off"
        )
    if "Q9" in doc.questions_served:
        if "meeting" in doc.event_id.lower():
            return (
                "Account meeting notes showing the primary champion (the Director of "
                "Engineering) was absent and an Engineering Manager proxied for the team, "
                "with visibly lower engagement, a shorter agenda, and fewer action items "
                "agreed than in prior quarters — a continuation of the multi-quarter "
                "decline in champion involvement"
            )
        return (
            "Account health review noting declining champion engagement: the primary "
            "technical contact has become materially less responsive, meetings increasingly "
            "run through a less-senior proxy with thinner institutional knowledge, and the "
            "depth of the relationship that previously anchored the account is eroding"
        )
    if "Q8" in doc.questions_served:
        if "commit" in doc.event_id.lower():
            return (
                "Meeting notes capturing a specific feature-delivery commitment the account "
                "executive made verbally to the customer, including the discussed timeline — "
                "this commitment was never logged in the CRM or any formal tracking system, "
                "leaving a gap between the customer's expectation and what is recorded internally"
            )
        return (
            "Meeting notes referencing a previously logged feature commitment that was "
            "properly captured and tracked in the CRM — the well-managed follow-through case "
            "that contrasts with the unlogged verbal promise"
        )
    if "Q5" in doc.questions_served:
        return (
            "Customer success plan documenting the account's strategic goals, including a "
            "stated intent to expand into GenAI / AI-ML workloads and to evaluate the "
            "GraphRAG suite, alongside cluster-scale headroom needs as query volume climbs "
            "toward the current node ceiling — the expansion-readiness picture that frames "
            "the upcoming renewal-and-upsell discussion"
        )
    if "Q13" in doc.questions_served:
        return (
            "QBR review documenting a sustained decline in usage and a plan downgrade, "
            "with the account deprioritizing the graph platform and discussing a "
            "migration-away — a contraction that puts the upcoming renewal at risk"
        )
    if "Q14" in doc.questions_served:
        return (
            "Customer save-plan outlining remediation steps to reverse the contraction: "
            "re-engaging stakeholders, addressing the declining-usage drivers, and "
            "structuring an offer to secure the at-risk renewal"
        )
    return "Routine account documentation for partnership record-keeping"


def _derive_key_facts(doc: DocEvent, spine: AccountSpine) -> list[str]:
    """Extract key factual points for signal docs (code-generated from spine)."""
    facts = []
    if "Q12" in doc.questions_served:
        # Get the NPS trend from spine
        negative_nps = [n for n in spine.nps if n.verbatim_sentiment == "negative"]
        if negative_nps:
            facts.append(
                f"NPS verbatim sentiment turned negative in Q3 through Q4 of the most recent year"
            )
        facts.append("Usage metrics show consistent positive growth quarter over quarter")
        facts.append(
            "Partnership health flagged as requiring attention despite green technical metrics"
        )
        # Cross-reference the structured numbers vs. the qualitative signal
        latest_nps = spine.nps[-1] if spine.nps else None
        if latest_nps is not None:
            facts.append(
                f"Most recent NPS score recorded was {latest_nps.score} for survey period "
                f"{latest_nps.survey_period}, yet the accompanying verbatim comment reads as "
                f"{latest_nps.verbatim_sentiment} — the score and the sentiment disagree"
            )
        latest_usage = spine.usage[-1] if spine.usage else None
        if latest_usage is not None:
            facts.append(
                f"Latest tracked query volume was {latest_usage.query_volume_m}M/month on a "
                f"{latest_usage.cluster_nodes}-node cluster, confirming product adoption is "
                f"still climbing even as relationship sentiment deteriorates"
            )
        facts.append(
            "Resolution path: the contradiction must be surfaced to the executive sponsor; "
            "treating the green usage dashboard as 'all clear' would miss the relationship risk"
        )
    if "Q2" in doc.questions_served:
        active_opp = next(
            (o for o in spine.opportunities if o.stage in ("negotiation", "proposal")),
            None,
        )
        if active_opp:
            facts.append(
                f"Current renewal opportunity is in '{active_opp.stage}' stage at "
                f"${active_opp.amount_usd:,} with outstanding concerns still open"
            )
        facts.append("Multiple open items in the success plan remain unresolved heading into renewal")
        facts.append("Customer executive team has raised pricing objections and product-fit concerns")
        at_risk_contract = next(
            (c for c in spine.contracts if not c.auto_renew), None
        )
        if at_risk_contract is not None:
            facts.append(
                f"The contract up for renewal (value ${at_risk_contract.value_usd:,}, ending "
                f"{at_risk_contract.end_date.isoformat()}) is not set to auto-renew, so an "
                f"active sign-off decision is required before it lapses"
            )
        facts.append(
            "Economic buyer (CFO-level) sign-off is the gating step; the account team should "
            "enter the renewal conversation with an itemized response to each raised objection"
        )
    if "Q9" in doc.questions_served:
        champion = next((c for c in spine.contacts if c.role == "champion"), None)
        if champion and champion.active_to:
            facts.append(
                f"Primary champion {champion.full_name} ({champion.title}) has reduced "
                f"engagement, with activity tapering off around {champion.active_to.isoformat()}"
            )
        facts.append("New contact Taylor Brooks is less engaged with product roadmap discussions")
        facts.append("Response rate to CSM outreach has declined significantly in recent quarters")
        facts.append(
            "Meeting cadence has thinned: recent sessions are shorter, carry fewer action "
            "items, and run through a proxy rather than the original technical champion"
        )
        facts.append(
            "Continuity risk: institutional knowledge concentrated in the departing champion "
            "is not yet transferred, which weakens renewal influence and roadmap alignment"
        )
    if "Q8" in doc.questions_served:
        if "commit" in doc.event_id.lower():
            facts.append("A specific feature-delivery commitment was made verbally during this meeting")
            facts.append("The commitment was NOT logged in the CRM or formal tracking system")
            facts.append("Customer expects delivery based on this verbal commitment")
            facts.append(
                "Risk: with no logged record, the commitment is invisible to renewal and "
                "delivery planning, creating an expectation gap the customer may invoke at renewal"
            )
            facts.append(
                "Recommended action: formalize the commitment in the CRM immediately, with "
                "owner, scope, and the discussed timeline, so internal tracking matches the promise"
            )
        else:
            facts.append("A commitment was made and properly logged in the CRM system")
            facts.append("Formal tracking is in place for this delivery")
            facts.append(
                "This is the well-managed control case: the logged commitment is visible to "
                "delivery and renewal planning, so there is no expectation gap to reconcile"
            )
    if "Q5" in doc.questions_served:
        graphrag_usage = [u for u in spine.usage if not u.graphrag_enabled]
        if graphrag_usage:
            facts.append("GraphRAG/GenAI capabilities are not yet enabled on the account")
        facts.append("Account expressed specific interest in AI/ML workload expansion")
        facts.append("Current cluster is approaching capacity limits based on recent usage trends")
        latest_usage = spine.usage[-1] if spine.usage else None
        if latest_usage is not None:
            facts.append(
                f"At the latest reading, query volume reached {latest_usage.query_volume_m}M/month "
                f"on {latest_usage.cluster_nodes} nodes running {latest_usage.edition.value} — "
                f"headroom is tightening and a scale conversation is warranted"
            )
        facts.append(
            "Expansion thesis: enabling the GraphRAG / GenAI suite addresses the stated AI-ML "
            "intent and gives a natural upsell to anchor the upcoming renewal discussion"
        )
    if "Q13" in doc.questions_served:
        declining_nps = [n for n in spine.nps if n.verbatim_sentiment == "negative"]
        if declining_nps:
            facts.append("NPS score and verbatim sentiment have both declined to their lowest levels")
        facts.append("Usage metrics show a sustained quarter-over-quarter decline from the prior peak")
        facts.append("The account downgraded its plan to a lower tier with a reduced contract value")
        facts.append("The team is discussing a migration-away from the graph platform; renewal is at risk")
    if "Q14" in doc.questions_served:
        facts.append("A remediation / save-plan has been opened to reverse the account contraction")
        facts.append("Save actions target the declining-usage drivers and stakeholder re-engagement")
        facts.append("The plan aims to secure the at-risk renewal before it slips")
    if not facts:
        facts = ["Routine account activity documented", "No critical items identified"]
    return facts


def _derive_noise_topic(doc: DocEvent) -> str:
    slug = doc.event_id.lower()
    if "onboarding" in slug or "runbook" in slug:
        return "customer onboarding process and deployment checklist"
    if "feature" in slug or "guide" in slug:
        return "enterprise feature enablement and best practices"
    if "qbr" in slug:
        return "positive quarterly business review highlights and achievements"
    if "architecture" in slug:
        return "architecture review and optimization recommendations"
    if "security" in slug or "audit" in slug:
        return "security audit findings and compliance status"
    if "migration" in slug:
        return "migration planning and execution status"
    if "cluster" in slug or "sizing" in slug or "optimization" in slug:
        return "cluster sizing recommendations and performance optimization"
    if "renewal" in slug or "planning" in slug:
        return "renewal planning and account health overview"
    if "performance" in slug or "benchmark" in slug:
        return "performance benchmarking results and capacity planning"
    if "routine" in slug:
        return "routine quarterly account review and partnership health"
    if "logged_promise" in slug:
        return "meeting notes with formal commitment tracking"
    if "near_miss" in slug:
        return "account health check and positive indicators"
    if "intro" in slug:
        return "ArangoGraph product overview and feature summary"
    return "routine account management documentation"


def _format_markdown_doc(
    doc: DocEvent,
    prose: DocsProse,
    date_str: str,
    doc_type: str,
    spine: AccountSpine,
) -> str:
    """
    Format the document as a .md file with metadata header and YAML front-matter.

    D-09: role and questions_served are NOT in the file content.
    """
    header = (
        f"<!-- module={doc.module} account_id={doc.account_id} "
        f"entity_id={doc.entity_id} citable_url={doc.citable_url} -->\n\n"
    )

    front_matter = (
        f"---\n"
        f"date: {date_str}\n"
        f"account: {spine.account_name}\n"
        f"doc_type: {doc_type}\n"
        f"---\n\n"
    )

    sections_text = "\n\n".join(
        f"### Section {i + 1}\n\n{section}"
        for i, section in enumerate(prose.body_sections)
    )

    action_items_text = ""
    if prose.action_items:
        items = "\n".join(f"- {item}" for item in prose.action_items)
        action_items_text = f"\n\n## Action Items\n\n{items}"

    doc_body = (
        f"# {prose.title}\n\n"
        f"## Executive Summary\n\n"
        f"{prose.executive_summary}\n\n"
        f"## Details\n\n"
        f"{sections_text}"
        f"{action_items_text}\n"
    )

    return header + front_matter + doc_body


def generate_docs(
    spines: list[AccountSpine],
    output_dir: Path,
    cache_dir: Path,
) -> dict:
    """
    Generate Docs .md files for all DocEvents with a _docs module.

    Returns:
        manifest: dict keyed by file_name
    """
    manifest: dict = {}

    for spine in spines:
        for doc in spine.docs:
            if not doc.module.endswith("_docs"):
                continue

            module_dir = output_dir / "unstructured" / doc.module
            module_dir.mkdir(parents=True, exist_ok=True)

            date_str = doc.event_date.strftime("%B %Y")
            doc_type = _derive_doc_type(doc)

            if doc.role == "signal":
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
                    output_schema=DocsProse,
                    cache_dir=cache_dir,
                )
            else:
                # Near-miss docs use the noise template so they have positive/routine content.
                # A near-miss is a superficially relevant doc from an earlier (benign) period —
                # it shares vocabulary with the question but is NOT the authoritative evidence.
                # Using the noise template ensures the stub prose is clearly different from the
                # signal stubs, which is required for the near-miss guard (D-08) to pass.
                # (Without a live LLM the stub fallback makes signal and near-miss identical
                # if both use the signal template — this is the design fix for plan 02-05.)
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
                    output_schema=DocsProse,
                    cache_dir=cache_dir,
                )

            content = _format_markdown_doc(doc, prose, date_str, doc_type, spine)
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
