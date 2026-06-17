"""
Northwind Analytics event spine — Account A (healthy/expanding).

Product ladder: Community (2020) → Enterprise (2021) → ArangoGraph (2023)
Key questions served: Q7 (structured-only anchor), Q5 (GenAI upsell readiness)

All entity_ids use canonical_uuid("northwind", ...).
All file_names use make_file_name(module, event_id, ext).
All citable_urls use make_citable_url("northwind", source, event_id).

No Faker dependency — all hard facts are literal values.
"""

from datetime import date

from data_gen.spine.entity_registry import (
    NORTHWIND_ACCOUNT_ID,
    GLOBAL_SEED,  # noqa: F401 — available for generators
    canonical_uuid,
    make_citable_url,
    make_file_name,
)
from data_gen.spine.event_spine import (
    AccountSpine,
    ArangoEdition,
    ContactEvent,
    ContractEvent,
    DocEvent,
    NpsEvent,
    OpportunityEvent,
    UsageEvent,
)

# ---------------------------------------------------------------------------
# Contracts (3 entries — Community → Enterprise → ArangoGraph ladder)
# ---------------------------------------------------------------------------

_contracts: list[ContractEvent] = [
    # 1. Community (free tier — land)
    ContractEvent(
        event_id="nw_contract_community_2020",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:community_2020"),
        signed_date=date(2020, 3, 1),
        end_date=date(2021, 2, 28),
        value_usd=0,
        product_scope=ArangoEdition.Community,
        auto_renew=False,
    ),
    # 2. Enterprise (upgrade — SmartGraphs + security/auditing)
    ContractEvent(
        event_id="nw_contract_enterprise_2021",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:enterprise_2021"),
        signed_date=date(2021, 3, 1),
        end_date=date(2022, 2, 28),
        value_usd=120_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    # 3. Enterprise expansion amendment 2022
    ContractEvent(
        event_id="nw_contract_enterprise_2022",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:enterprise_2022"),
        signed_date=date(2022, 3, 1),
        end_date=date(2023, 2, 28),
        value_usd=145_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    # 4. Enterprise expansion amendment 2023 (before ArangoGraph migration)
    ContractEvent(
        event_id="nw_contract_enterprise_2023",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:enterprise_2023"),
        signed_date=date(2023, 3, 1),
        end_date=date(2023, 5, 31),
        value_usd=160_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=False,
    ),
    # 5. ArangoGraph managed cloud (migration — year 1)
    ContractEvent(
        event_id="nw_contract_arangograph_2023",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:arangograph_2023"),
        signed_date=date(2023, 6, 1),
        end_date=date(2024, 5, 31),
        value_usd=200_000,
        product_scope=ArangoEdition.ArangoGraph,
        auto_renew=True,
    ),
    # 6. ArangoGraph renewal (year 2)
    ContractEvent(
        event_id="nw_contract_arangograph_2024",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:arangograph_2024"),
        signed_date=date(2024, 6, 1),
        end_date=date(2025, 5, 31),
        value_usd=220_000,
        product_scope=ArangoEdition.ArangoGraph,
        auto_renew=True,
    ),
    # 7. ArangoGraph auto-renewal (year 3) — holds the account while the GenAI upsell
    #    proposal (nw_opp_renewal_2025) is being negotiated.  auto_renew=True on the
    #    prior contract triggered this bridge contract at the same rate.
    ContractEvent(
        event_id="nw_contract_arangograph_2025",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contract:arangograph_2025"),
        signed_date=date(2025, 6, 1),
        end_date=date(2026, 5, 31),
        value_usd=220_000,
        product_scope=ArangoEdition.ArangoGraph,
        auto_renew=True,
    ),
]

# ---------------------------------------------------------------------------
# Usage (18 quarterly records — 2021-Q1 through 2025-Q2)
# query_volume_m: ~15% quarterly growth from 2.5 → ~12.0
# cluster_nodes: 3 → 4 → 6 → 8 → 10 progression
# edition: Enterprise 2021-Q1 through 2023-Q1; ArangoGraph 2023-Q2 onward
# smartgraphs_enabled: True throughout
# graphrag_enabled: False throughout (GenAI whitespace — Q5 signal)
# ---------------------------------------------------------------------------

def _usage(
    period: str,
    qvol: float,
    nodes: int,
    edition: ArangoEdition,
) -> UsageEvent:
    return UsageEvent(
        event_id=f"nw_usage_{period.lower().replace('-', '_')}",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", f"usage:{period}"),
        period=period,
        query_volume_m=round(qvol, 2),
        cluster_nodes=nodes,
        edition=edition,
        smartgraphs_enabled=True,
        graphrag_enabled=False,
    )


_usage_records: list[UsageEvent] = [
    # 2021 — Enterprise, 3 nodes, baseline growth
    _usage("2021-Q1", 2.50, 3, ArangoEdition.Enterprise),
    _usage("2021-Q2", 2.88, 3, ArangoEdition.Enterprise),
    _usage("2021-Q3", 3.31, 3, ArangoEdition.Enterprise),
    _usage("2021-Q4", 3.81, 4, ArangoEdition.Enterprise),
    # 2022 — Enterprise, cluster expands
    _usage("2022-Q1", 4.38, 4, ArangoEdition.Enterprise),
    _usage("2022-Q2", 5.04, 4, ArangoEdition.Enterprise),
    _usage("2022-Q3", 5.79, 6, ArangoEdition.Enterprise),
    _usage("2022-Q4", 6.66, 6, ArangoEdition.Enterprise),
    # 2023-Q1 still Enterprise; Q2 migrates to ArangoGraph
    _usage("2023-Q1", 7.66, 6, ArangoEdition.Enterprise),
    _usage("2023-Q2", 8.81, 8, ArangoEdition.ArangoGraph),
    _usage("2023-Q3", 9.13, 8, ArangoEdition.ArangoGraph),
    _usage("2023-Q4", 9.48, 8, ArangoEdition.ArangoGraph),
    # 2024 — ArangoGraph, cluster growing toward scale limit
    _usage("2024-Q1", 9.84, 8, ArangoEdition.ArangoGraph),
    _usage("2024-Q2", 10.22, 10, ArangoEdition.ArangoGraph),
    _usage("2024-Q3", 10.61, 10, ArangoEdition.ArangoGraph),
    _usage("2024-Q4", 11.01, 10, ArangoEdition.ArangoGraph),
    # 2025 — approaching scale ceiling (triggers Q5 upsell conversation)
    _usage("2025-Q1", 11.43, 10, ArangoEdition.ArangoGraph),
    _usage("2025-Q2", 11.87, 10, ArangoEdition.ArangoGraph),
]

# ---------------------------------------------------------------------------
# Contacts (champion + economic buyer)
# ---------------------------------------------------------------------------

_contacts: list[ContactEvent] = [
    ContactEvent(
        event_id="nw_contact_sarah_chen",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contact:sarah_chen"),
        full_name="Sarah Chen",
        title="VP of Data Platform",
        role="champion",
        email="sarah.chen@northwindanalytics.com",
        active_from=date(2020, 3, 1),
        active_to=None,
    ),
    ContactEvent(
        event_id="nw_contact_michael_torres",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "contact:michael_torres"),
        full_name="Michael Torres",
        title="CTO",
        role="economic_buyer",
        email="m.torres@northwindanalytics.com",
        active_from=date(2020, 3, 1),
        active_to=None,
    ),
]

# ---------------------------------------------------------------------------
# Opportunities
# ---------------------------------------------------------------------------

_opportunities: list[OpportunityEvent] = [
    # Initial land (Community — $0)
    OpportunityEvent(
        event_id="nw_opp_new_2020",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "opportunity:new_2020"),
        stage="closed-won",
        close_date=date(2020, 3, 1),
        amount_usd=0,
        opportunity_type="new",
        product_scope=ArangoEdition.Community,
        contract_entity_id=canonical_uuid("northwind", "contract:community_2020"),
        renewal_date=date(2021, 2, 28),  # nw_contract_community_2020 end_date
    ),
    # Expansion to Enterprise
    OpportunityEvent(
        event_id="nw_opp_expansion_2021",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "opportunity:expansion_2021"),
        stage="closed-won",
        close_date=date(2021, 3, 1),
        amount_usd=120_000,
        opportunity_type="expansion",
        product_scope=ArangoEdition.Enterprise,
        contract_entity_id=canonical_uuid("northwind", "contract:enterprise_2021"),
        renewal_date=date(2022, 2, 28),  # nw_contract_enterprise_2021 end_date
    ),
    # Enterprise expansion amendment 2022
    OpportunityEvent(
        event_id="nw_opp_expansion_2022",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "opportunity:expansion_2022"),
        stage="closed-won",
        close_date=date(2022, 3, 1),
        amount_usd=145_000,
        opportunity_type="expansion",
        product_scope=ArangoEdition.Enterprise,
        contract_entity_id=canonical_uuid("northwind", "contract:enterprise_2022"),
        renewal_date=date(2023, 2, 28),  # nw_contract_enterprise_2022 end_date
    ),
    # Migration to ArangoGraph
    OpportunityEvent(
        event_id="nw_opp_expansion_2023",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "opportunity:expansion_2023"),
        stage="closed-won",
        close_date=date(2023, 6, 1),
        amount_usd=200_000,
        opportunity_type="expansion",
        product_scope=ArangoEdition.ArangoGraph,
        contract_entity_id=canonical_uuid("northwind", "contract:arangograph_2023"),
        renewal_date=date(2024, 5, 31),  # nw_contract_arangograph_2023 end_date
    ),
    # In-progress renewal 2025 — GenAI upsell being discussed; no signed contract yet
    OpportunityEvent(
        event_id="nw_opp_renewal_2025",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "opportunity:renewal_2025"),
        stage="proposal",
        close_date=date(2025, 6, 1),
        amount_usd=240_000,
        opportunity_type="renewal",
        product_scope=ArangoEdition.ArangoGraph,
        contract_entity_id=None,   # proposal — DocuSign not signed yet
        renewal_date=None,
    ),
]

# ---------------------------------------------------------------------------
# NPS (quarterly 2022-Q1 through 2025-Q2 — all positive for Northwind)
# ---------------------------------------------------------------------------

def _nps(period: str, score: int, survey_date: date) -> NpsEvent:
    return NpsEvent(
        event_id=f"nw_nps_{period.lower().replace('-', '_')}",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", f"nps:{period}"),
        score=score,
        verbatim_sentiment="positive",
        survey_date=survey_date,
        survey_period=period,
    )


_nps_records: list[NpsEvent] = [
    _nps("2022-Q1", 8, date(2022, 3, 31)),
    _nps("2022-Q2", 9, date(2022, 6, 30)),
    _nps("2022-Q3", 8, date(2022, 9, 30)),
    _nps("2022-Q4", 9, date(2022, 12, 31)),
    _nps("2023-Q1", 9, date(2023, 3, 31)),
    _nps("2023-Q2", 8, date(2023, 6, 30)),
    _nps("2023-Q3", 9, date(2023, 9, 30)),
    _nps("2023-Q4", 9, date(2023, 12, 31)),
    _nps("2024-Q1", 9, date(2024, 3, 31)),
    _nps("2024-Q2", 8, date(2024, 6, 30)),
    _nps("2024-Q3", 9, date(2024, 9, 30)),
    _nps("2024-Q4", 9, date(2024, 12, 31)),
    _nps("2025-Q1", 9, date(2025, 3, 31)),
    _nps("2025-Q2", 8, date(2025, 6, 30)),
]

# ---------------------------------------------------------------------------
# DocEvents
# ---------------------------------------------------------------------------

# ---- Signal docs for Q5 (ArangoGraph/GenAI upsell readiness) ----

_signal_docs: list[DocEvent] = [
    # Q5 signal 1: CSM Slack note — Sarah Chen hitting scale limits
    DocEvent(
        event_id="nw_slack_scale_limit_2024q2",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "doc:nw_slack_scale_limit_2024q2"),
        module="northwind_slack",
        file_name=make_file_name("northwind_slack", "nw_slack_scale_limit_2024q2", "txt"),
        citable_url=make_citable_url("northwind", "slack", "nw_slack_scale_limit_2024q2"),
        event_date=date(2024, 4, 15),
        role="signal",
        questions_served=["Q5"],
        spine_events=["nw_usage_2024_q2", "nw_contact_sarah_chen"],
    ),
    # Q5 signal 2: Success plan .md — scale goals and GenAI intent documented
    DocEvent(
        event_id="nw_docs_success_plan_2024",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "doc:nw_docs_success_plan_2024"),
        module="northwind_docs",
        file_name=make_file_name("northwind_docs", "nw_docs_success_plan_2024", "md"),
        citable_url=make_citable_url("northwind", "docs", "nw_docs_success_plan_2024"),
        event_date=date(2024, 6, 1),
        role="signal",
        questions_served=["Q5"],
        spine_events=["nw_usage_2024_q2", "nw_contract_arangograph_2024"],
    ),
    # Q5 signal 3: Exec email — Michael Torres expressing GenAI/GraphRAG intent
    DocEvent(
        event_id="nw_email_genai_intent_2025q1",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "doc:nw_email_genai_intent_2025q1"),
        module="northwind_email",
        file_name=make_file_name("northwind_email", "nw_email_genai_intent_2025q1", "txt"),
        citable_url=make_citable_url("northwind", "email", "nw_email_genai_intent_2025q1"),
        event_date=date(2025, 1, 20),
        role="signal",
        questions_served=["Q5"],
        spine_events=["nw_contact_michael_torres", "nw_opp_renewal_2025"],
    ),
]

# ---- Near-miss docs for Q5 ----

_near_miss_docs: list[DocEvent] = [
    # Q5 near-miss 1: Early 2022 Slack thread mentioning scale — resolved positively
    # (same vocab as signal, but 2022 context; cluster grew and the issue was resolved)
    DocEvent(
        event_id="nw_slack_scale_mention_2022q2",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "doc:nw_slack_scale_mention_2022q2"),
        module="northwind_slack",
        file_name=make_file_name("northwind_slack", "nw_slack_scale_mention_2022q2", "txt"),
        citable_url=make_citable_url("northwind", "slack", "nw_slack_scale_mention_2022q2"),
        event_date=date(2022, 5, 10),
        role="near-miss",
        questions_served=["Q5"],
        spine_events=[],
    ),
    # Q5 near-miss 2: Docs entry discussing ArangoGraph features generically — no GenAI intent
    DocEvent(
        event_id="nw_docs_arangograph_intro_2023q3",
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", "doc:nw_docs_arangograph_intro_2023q3"),
        module="northwind_docs",
        file_name=make_file_name("northwind_docs", "nw_docs_arangograph_intro_2023q3", "md"),
        citable_url=make_citable_url("northwind", "docs", "nw_docs_arangograph_intro_2023q3"),
        event_date=date(2023, 8, 15),
        role="near-miss",
        questions_served=["Q5"],
        spine_events=[],
    ),
]

# ---- Noise docs (35 entries across all 4 Northwind modules) ----

def _noise_doc(
    module: str,
    slug: str,
    event_date: date,
    ext: str = "txt",
) -> DocEvent:
    """Helper to create a noise DocEvent with minimal boilerplate."""
    account_key = "northwind"
    source = module.split("_", 1)[1]  # e.g. "northwind_slack" → "slack"
    event_id = f"nw_{source}_{slug}"
    return DocEvent(
        event_id=event_id,
        account_id=NORTHWIND_ACCOUNT_ID,
        entity_id=canonical_uuid("northwind", f"doc:{event_id}"),
        module=module,
        file_name=make_file_name(module, event_id, ext),
        citable_url=make_citable_url(account_key, source, event_id),
        event_date=event_date,
        role="noise",
        questions_served=[],
        spine_events=[],
    )


_noise_docs: list[DocEvent] = [
    # northwind_slack (12 entries — routine ops, onboarding, QBR, support)
    _noise_doc("northwind_slack", "onboarding_welcome_2020q2", date(2020, 4, 5)),
    _noise_doc("northwind_slack", "deployment_status_2020q3", date(2020, 7, 12)),
    _noise_doc("northwind_slack", "community_setup_questions_2020q4", date(2020, 10, 3)),
    _noise_doc("northwind_slack", "upgrade_planning_thread_2021q1", date(2021, 1, 20)),
    _noise_doc("northwind_slack", "enterprise_kickoff_2021q2", date(2021, 4, 8)),
    _noise_doc("northwind_slack", "smartgraphs_enablement_2021q3", date(2021, 7, 22)),
    _noise_doc("northwind_slack", "qbr_prep_notes_2022q1", date(2022, 2, 14)),
    _noise_doc("northwind_slack", "product_changelog_v3_9_2022q2", date(2022, 5, 18)),
    _noise_doc("northwind_slack", "support_case_ack_2022q3", date(2022, 8, 30)),
    _noise_doc("northwind_slack", "positive_qbr_summary_2023q1", date(2023, 2, 28)),
    _noise_doc("northwind_slack", "arangograph_migration_checklist_2023q2", date(2023, 5, 5)),
    _noise_doc("northwind_slack", "cluster_health_check_2024q1", date(2024, 1, 15)),
    # northwind_email (8 entries)
    _noise_doc("northwind_email", "welcome_series_2020q1", date(2020, 3, 10)),
    _noise_doc("northwind_email", "quarterly_review_invite_2021q3", date(2021, 7, 6)),
    _noise_doc("northwind_email", "license_renewal_confirmation_2022q1", date(2022, 2, 25)),
    _noise_doc("northwind_email", "product_webinar_invite_2022q3", date(2022, 9, 2)),
    _noise_doc("northwind_email", "support_ticket_closed_2023q1", date(2023, 1, 17)),
    _noise_doc("northwind_email", "qbr_recap_positive_2023q3", date(2023, 9, 12)),
    _noise_doc("northwind_email", "renewal_confirmation_2024q2", date(2024, 6, 5)),
    # CR-06 fix: "renewal_success_2024" noise entry removed — it collided with
    # _nw_renewal_success_near_miss below (same event_id/file_name, last-write-wins).
    # The near-miss role is the intended one; the noise slot is eliminated here.
    # If a distinct noise email is needed at this date, give it a unique slug.
    # northwind_docs (8 entries, .md)
    _noise_doc("northwind_docs", "onboarding_runbook_2020q2", date(2020, 5, 1), "md"),
    _noise_doc("northwind_docs", "enterprise_feature_guide_2021q2", date(2021, 4, 20), "md"),
    _noise_doc("northwind_docs", "qbr_notes_2021q4", date(2021, 12, 8), "md"),
    _noise_doc("northwind_docs", "architecture_review_2022q2", date(2022, 4, 19), "md"),
    _noise_doc("northwind_docs", "security_audit_checklist_2022q4", date(2022, 11, 14), "md"),
    _noise_doc("northwind_docs", "arangograph_migration_guide_2023q1", date(2023, 2, 7), "md"),
    _noise_doc("northwind_docs", "qbr_notes_positive_2024q1", date(2024, 2, 20), "md"),
    _noise_doc("northwind_docs", "cluster_optimization_notes_2024q3", date(2024, 8, 5), "md"),
    # northwind_pdf (7 entries)
    _noise_doc("northwind_pdf", "roi_report_2021", date(2021, 12, 15), "pdf"),
    _noise_doc("northwind_pdf", "ebr_deck_2022q1", date(2022, 3, 10), "pdf"),
    _noise_doc("northwind_pdf", "contract_enterprise_2022_signed", date(2022, 3, 1), "pdf"),
    _noise_doc("northwind_pdf", "roi_report_2022", date(2022, 12, 10), "pdf"),
    _noise_doc("northwind_pdf", "ebr_deck_2023q3", date(2023, 9, 8), "pdf"),
    _noise_doc("northwind_pdf", "arangograph_roi_report_2024", date(2024, 3, 20), "pdf"),
    _noise_doc("northwind_pdf", "ebr_deck_2024q3", date(2024, 9, 15), "pdf"),
]

# ---------------------------------------------------------------------------
# Northwind renewal success doc — serves as Q2 near-miss for Meridian
# (different account, positive renewal outcome, same renewal vocabulary)
# ---------------------------------------------------------------------------

_nw_renewal_success_near_miss: DocEvent = DocEvent(
    event_id="nw_email_renewal_success_2024",
    account_id=NORTHWIND_ACCOUNT_ID,
    entity_id=canonical_uuid("northwind", "doc:nw_email_renewal_success_2024"),
    module="northwind_email",
    file_name=make_file_name("northwind_email", "nw_email_renewal_success_2024", "txt"),
    citable_url=make_citable_url("northwind", "email", "nw_email_renewal_success_2024"),
    event_date=date(2024, 6, 20),
    role="near-miss",
    questions_served=["Q2"],
    spine_events=[],
)

# ---------------------------------------------------------------------------
# Assemble NORTHWIND_SPINE
# ---------------------------------------------------------------------------

NORTHWIND_SPINE: AccountSpine = AccountSpine(
    account_id=NORTHWIND_ACCOUNT_ID,
    account_name="Northwind Analytics",
    contracts=_contracts,
    usage=_usage_records,
    contacts=_contacts,
    opportunities=_opportunities,
    nps=_nps_records,
    docs=_signal_docs + _near_miss_docs + _noise_docs + [_nw_renewal_success_near_miss],
)
