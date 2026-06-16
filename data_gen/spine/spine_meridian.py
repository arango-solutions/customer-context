"""
Meridian Logistics event spine — Account B (usage-green / sentiment-red).

Stays Enterprise self-managed throughout (no ladder climb — that's the whitespace).
Key questions served: Q12 (centerpiece), Q2, Q9, Q8

All entity_ids use canonical_uuid("meridian", ...).
All file_names use make_file_name(module, event_id, ext).
All citable_urls use make_citable_url("meridian", source, event_id).

No Faker dependency — all hard facts are literal values.
"""

from datetime import date

from data_gen.spine.entity_registry import (
    MERIDIAN_ACCOUNT_ID,
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
# Contracts (Enterprise self-managed throughout — 4 annual renewals + in-progress 2025)
# ---------------------------------------------------------------------------

_contracts: list[ContractEvent] = [
    # Initial contract
    ContractEvent(
        event_id="me_contract_enterprise_2021",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contract:enterprise_2021"),
        signed_date=date(2021, 1, 15),
        end_date=date(2022, 1, 14),
        value_usd=180_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    ContractEvent(
        event_id="me_contract_enterprise_2022",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contract:enterprise_2022"),
        signed_date=date(2022, 1, 15),
        end_date=date(2023, 1, 14),
        value_usd=180_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    ContractEvent(
        event_id="me_contract_enterprise_2023",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contract:enterprise_2023"),
        signed_date=date(2023, 1, 15),
        end_date=date(2024, 1, 14),
        value_usd=185_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    ContractEvent(
        event_id="me_contract_enterprise_2024",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contract:enterprise_2024"),
        signed_date=date(2024, 1, 15),
        end_date=date(2025, 1, 14),
        value_usd=188_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    # In-progress 2025 renewal — in negotiation (risk context for Q2)
    ContractEvent(
        event_id="me_contract_enterprise_2025",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contract:enterprise_2025"),
        signed_date=date(2025, 1, 15),
        end_date=date(2026, 1, 14),
        value_usd=190_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
]

# ---------------------------------------------------------------------------
# Usage (18 quarterly records — 2021-Q1 through 2025-Q2)
# query_volume_m: grows 5.0 → 15.0 (looks green — this is the Q12 structured side)
# cluster_nodes: 4 → 6 → 8 → 10 → 12 progression
# edition: Enterprise throughout
# smartgraphs_enabled: True from 2021
# graphrag_enabled: False throughout
# ---------------------------------------------------------------------------

def _usage(
    period: str,
    qvol: float,
    nodes: int,
) -> UsageEvent:
    return UsageEvent(
        event_id=f"me_usage_{period.lower().replace('-', '_')}",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", f"usage:{period}"),
        period=period,
        query_volume_m=round(qvol, 2),
        cluster_nodes=nodes,
        edition=ArangoEdition.Enterprise,
        smartgraphs_enabled=True,
        graphrag_enabled=False,
    )


_usage_records: list[UsageEvent] = [
    _usage("2021-Q1", 5.00, 4),
    _usage("2021-Q2", 5.56, 4),
    _usage("2021-Q3", 6.17, 4),
    _usage("2021-Q4", 6.85, 6),
    _usage("2022-Q1", 7.61, 6),
    _usage("2022-Q2", 8.45, 6),
    _usage("2022-Q3", 9.38, 8),
    _usage("2022-Q4", 10.41, 8),
    _usage("2023-Q1", 11.06, 8),
    _usage("2023-Q2", 11.74, 8),
    _usage("2023-Q3", 12.45, 10),
    _usage("2023-Q4", 12.77, 10),
    _usage("2024-Q1", 13.12, 10),
    _usage("2024-Q2", 13.47, 10),
    _usage("2024-Q3", 13.83, 12),
    _usage("2024-Q4", 14.20, 12),
    _usage("2025-Q1", 14.59, 12),
    _usage("2025-Q2", 15.00, 12),
]

# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

_contacts: list[ContactEvent] = [
    # Champion — goes quiet in Q3 2024 (Q9 signal)
    ContactEvent(
        event_id="me_contact_james_okafor",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contact:james_okafor"),
        full_name="James Okafor",
        title="Director of Engineering",
        role="champion",
        email="j.okafor@meridianlogistics.com",
        active_from=date(2021, 1, 15),
        active_to=date(2024, 9, 1),  # goes quiet — fewer than 3 exchanges in last 90 days by Q4
    ),
    # Less-engaged replacement contact (Q9 signal — new person, less invested)
    ContactEvent(
        event_id="me_contact_taylor_brooks",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contact:taylor_brooks"),
        full_name="Taylor Brooks",
        title="Engineering Manager",
        role="user",
        email="t.brooks@meridianlogistics.com",
        active_from=date(2024, 7, 1),
        active_to=None,
    ),
    # CFO (economic buyer — stable throughout)
    ContactEvent(
        event_id="me_contact_patricia_vance",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "contact:patricia_vance"),
        full_name="Patricia Vance",
        title="CFO",
        role="economic_buyer",
        email="p.vance@meridianlogistics.com",
        active_from=date(2021, 1, 15),
        active_to=None,
    ),
]

# ---------------------------------------------------------------------------
# Opportunities
# ---------------------------------------------------------------------------

_opportunities: list[OpportunityEvent] = [
    # Initial land
    OpportunityEvent(
        event_id="me_opp_new_2021",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "opportunity:new_2021"),
        stage="closed-won",
        close_date=date(2021, 1, 15),
        amount_usd=180_000,
        opportunity_type="new",
        product_scope=ArangoEdition.Enterprise,
    ),
    # Renewals (all closed-won)
    OpportunityEvent(
        event_id="me_opp_renewal_2022",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "opportunity:renewal_2022"),
        stage="closed-won",
        close_date=date(2022, 1, 15),
        amount_usd=180_000,
        opportunity_type="renewal",
        product_scope=ArangoEdition.Enterprise,
    ),
    OpportunityEvent(
        event_id="me_opp_renewal_2023",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "opportunity:renewal_2023"),
        stage="closed-won",
        close_date=date(2023, 1, 15),
        amount_usd=185_000,
        opportunity_type="renewal",
        product_scope=ArangoEdition.Enterprise,
    ),
    OpportunityEvent(
        event_id="me_opp_renewal_2024",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "opportunity:renewal_2024"),
        stage="closed-won",
        close_date=date(2024, 1, 15),
        amount_usd=188_000,
        opportunity_type="renewal",
        product_scope=ArangoEdition.Enterprise,
    ),
    # Expansion attempt 2024 — closed-lost (the whitespace opportunity that slipped — Q8 context)
    OpportunityEvent(
        event_id="me_opp_expansion_2024_lost",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "opportunity:expansion_2024_lost"),
        stage="closed-lost",
        close_date=date(2024, 6, 30),
        amount_usd=60_000,
        opportunity_type="expansion",
        product_scope=ArangoEdition.ArangoGraph,
    ),
    # Current renewal in progress 2025 — at risk (Q2)
    OpportunityEvent(
        event_id="me_opp_renewal_2025",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "opportunity:renewal_2025"),
        stage="negotiation",
        close_date=date(2025, 1, 15),
        amount_usd=190_000,
        opportunity_type="renewal",
        product_scope=ArangoEdition.Enterprise,
    ),
]

# ---------------------------------------------------------------------------
# NPS (2022-Q1 through 2025-Q2)
# Score: 7-8 throughout (green/acceptable)
# Verbatim: positive 2022-2023, neutral 2024-Q1/Q2, NEGATIVE 2024-Q3/Q4 (Q12 red side)
# ---------------------------------------------------------------------------

def _nps(
    period: str,
    score: int,
    sentiment: str,
    survey_date: date,
) -> NpsEvent:
    return NpsEvent(
        event_id=f"me_nps_{period.lower().replace('-', '_')}",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", f"nps:{period}"),
        score=score,
        verbatim_sentiment=sentiment,
        survey_date=survey_date,
        survey_period=period,
    )


_nps_records: list[NpsEvent] = [
    # 2022: positive sentiment, scores 7-8
    _nps("2022-Q1", 8, "positive", date(2022, 3, 31)),
    _nps("2022-Q2", 7, "positive", date(2022, 6, 30)),
    _nps("2022-Q3", 8, "positive", date(2022, 9, 30)),
    _nps("2022-Q4", 8, "positive", date(2022, 12, 31)),
    # 2023: positive sentiment, scores 7-8
    _nps("2023-Q1", 8, "positive", date(2023, 3, 31)),
    _nps("2023-Q2", 7, "positive", date(2023, 6, 30)),
    _nps("2023-Q3", 8, "positive", date(2023, 9, 30)),
    _nps("2023-Q4", 7, "positive", date(2023, 12, 31)),
    # 2024-Q1/Q2: score still acceptable, verbatim turning neutral
    _nps("2024-Q1", 7, "neutral", date(2024, 3, 31)),
    _nps("2024-Q2", 8, "neutral", date(2024, 6, 30)),
    # 2024-Q3/Q4: NEGATIVE verbatim (Q12 red side) — score still 7-8 (the contradiction)
    _nps("2024-Q3", 7, "negative", date(2024, 9, 30)),
    _nps("2024-Q4", 8, "negative", date(2024, 12, 31)),
    # 2025
    _nps("2025-Q1", 7, "negative", date(2025, 3, 31)),
    _nps("2025-Q2", 8, "neutral", date(2025, 6, 30)),
]

# ---------------------------------------------------------------------------
# DocEvents — signal, near-miss, noise
# ---------------------------------------------------------------------------

# ---- Signal docs for Q12 (usage-green / sentiment-red — centerpiece) ----

_signal_q12: list[DocEvent] = [
    # Q12 signal 1: Slack escalation thread — Meridian ops burden + competitor eval
    DocEvent(
        event_id="me_slack_escalation_2024q3",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_slack_escalation_2024q3"),
        module="meridian_slack",
        file_name=make_file_name("meridian_slack", "me_slack_escalation_2024q3", "txt"),
        citable_url=make_citable_url("meridian", "slack", "me_slack_escalation_2024q3"),
        event_date=date(2024, 9, 10),
        role="signal",
        questions_served=["Q12", "Q2"],
        spine_events=["me_contact_james_okafor", "me_nps_2024_q3"],
    ),
    # Q12 signal 2: Exec-to-exec email thread — champion silent, new contact less engaged
    DocEvent(
        event_id="me_email_exec_2024q4",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_email_exec_2024q4"),
        module="meridian_email",
        file_name=make_file_name("meridian_email", "me_email_exec_2024q4", "txt"),
        citable_url=make_citable_url("meridian", "email", "me_email_exec_2024q4"),
        event_date=date(2024, 10, 5),
        role="signal",
        questions_served=["Q12"],
        spine_events=["me_contact_james_okafor", "me_contract_enterprise_2024"],
    ),
    # Q12 signal 3: QBR notes with red annotation — partnership health flagged
    DocEvent(
        event_id="me_docs_qbr_2024q3",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_docs_qbr_2024q3"),
        module="meridian_docs",
        file_name=make_file_name("meridian_docs", "me_docs_qbr_2024q3", "md"),
        citable_url=make_citable_url("meridian", "docs", "me_docs_qbr_2024q3"),
        event_date=date(2024, 8, 20),
        role="signal",
        questions_served=["Q12", "Q2"],
        spine_events=["me_nps_2024_q3", "me_usage_2024_q3"],
    ),
    # Q12 signal 4: EBR deck PDF — risk slide "partnership health: at risk"
    DocEvent(
        event_id="me_pdf_ebr_2024q4",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_pdf_ebr_2024q4"),
        module="meridian_pdf",
        file_name=make_file_name("meridian_pdf", "me_pdf_ebr_2024q4", "pdf"),
        citable_url=make_citable_url("meridian", "pdf", "me_pdf_ebr_2024q4"),
        event_date=date(2024, 11, 1),
        role="signal",
        questions_served=["Q12", "Q2"],
        spine_events=["me_contract_enterprise_2024", "me_nps_2024_q4"],
    ),
    # Q12 signal 5: NPS verbatim note — the negative text behind the acceptable score
    DocEvent(
        event_id="me_slack_nps_verbatim_2024q4",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_slack_nps_verbatim_2024q4"),
        module="meridian_slack",
        file_name=make_file_name("meridian_slack", "me_slack_nps_verbatim_2024q4", "txt"),
        citable_url=make_citable_url("meridian", "slack", "me_slack_nps_verbatim_2024q4"),
        event_date=date(2024, 11, 20),
        role="signal",
        questions_served=["Q12"],
        spine_events=["me_nps_2024_q4"],
    ),
]

# ---- Signal docs for Q2 (renewal risk + WHY) ----

_signal_q2: list[DocEvent] = [
    # Q2 signal 1: CSM Slack escalation flag — at-risk renewal
    DocEvent(
        event_id="me_slack_renewal_risk_2025q1",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_slack_renewal_risk_2025q1"),
        module="meridian_slack",
        file_name=make_file_name("meridian_slack", "me_slack_renewal_risk_2025q1", "txt"),
        citable_url=make_citable_url("meridian", "slack", "me_slack_renewal_risk_2025q1"),
        event_date=date(2025, 1, 10),
        role="signal",
        questions_served=["Q2"],
        spine_events=["me_opp_renewal_2025", "me_contact_taylor_brooks"],
    ),
    # Q2 signal 2: Renewal discussion email — executive objections, pricing pushback
    DocEvent(
        event_id="me_email_renewal_2025q1",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_email_renewal_2025q1"),
        module="meridian_email",
        file_name=make_file_name("meridian_email", "me_email_renewal_2025q1", "txt"),
        citable_url=make_citable_url("meridian", "email", "me_email_renewal_2025q1"),
        event_date=date(2025, 1, 25),
        role="signal",
        questions_served=["Q2"],
        spine_events=["me_opp_renewal_2025", "me_contract_enterprise_2024"],
    ),
    # Q2 signal 3: Success plan with open items — goals not yet achieved
    DocEvent(
        event_id="me_docs_success_plan_2024",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_docs_success_plan_2024"),
        module="meridian_docs",
        file_name=make_file_name("meridian_docs", "me_docs_success_plan_2024", "md"),
        citable_url=make_citable_url("meridian", "docs", "me_docs_success_plan_2024"),
        event_date=date(2024, 7, 15),
        role="signal",
        questions_served=["Q2"],
        spine_events=["me_opp_renewal_2025"],
    ),
]

# ---- Signal docs for Q9 (champion engagement) ----

_signal_q9: list[DocEvent] = [
    # Q9 signal 1: Email thread to James Okafor — declining frequency, no reply
    DocEvent(
        event_id="me_email_champion_2024q4",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_email_champion_2024q4"),
        module="meridian_email",
        file_name=make_file_name("meridian_email", "me_email_champion_2024q4", "txt"),
        citable_url=make_citable_url("meridian", "email", "me_email_champion_2024q4"),
        event_date=date(2024, 10, 20),
        role="signal",
        questions_served=["Q9"],
        spine_events=["me_contact_james_okafor"],
    ),
    # Q9 signal 2: CSM Slack note — "James has been quiet lately, Taylor now replying"
    DocEvent(
        event_id="me_slack_champion_quiet_2024q4",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_slack_champion_quiet_2024q4"),
        module="meridian_slack",
        file_name=make_file_name("meridian_slack", "me_slack_champion_quiet_2024q4", "txt"),
        citable_url=make_citable_url("meridian", "slack", "me_slack_champion_quiet_2024q4"),
        event_date=date(2024, 11, 5),
        role="signal",
        questions_served=["Q9"],
        spine_events=["me_contact_james_okafor", "me_contact_taylor_brooks"],
    ),
    # Q9 signal 3: Meeting notes .md — champion absent, Taylor proxied
    DocEvent(
        event_id="me_docs_meeting_2024q4",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_docs_meeting_2024q4"),
        module="meridian_docs",
        file_name=make_file_name("meridian_docs", "me_docs_meeting_2024q4", "md"),
        citable_url=make_citable_url("meridian", "docs", "me_docs_meeting_2024q4"),
        event_date=date(2024, 10, 30),
        role="signal",
        questions_served=["Q9"],
        spine_events=["me_contact_james_okafor"],
    ),
]

# ---- Signal docs for Q8 (unlogged promise — never in CRM) ----

_signal_q8: list[DocEvent] = [
    # Q8 signal 1: Email from AE committing to feature timeline — NEVER logged in CRM
    # spine_events=[] intentional: this promise has NO corresponding structured record
    DocEvent(
        event_id="me_email_promise_2023q2",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_email_promise_2023q2"),
        module="meridian_email",
        file_name=make_file_name("meridian_email", "me_email_promise_2023q2", "txt"),
        citable_url=make_citable_url("meridian", "email", "me_email_promise_2023q2"),
        event_date=date(2023, 5, 12),
        role="signal",
        questions_served=["Q8"],
        spine_events=[],  # unlogged — no CRM record — the point of Q8
    ),
    # Q8 signal 2: Meeting notes capturing verbal commit
    DocEvent(
        event_id="me_docs_commit_2023q2",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_docs_commit_2023q2"),
        module="meridian_docs",
        file_name=make_file_name("meridian_docs", "me_docs_commit_2023q2", "md"),
        citable_url=make_citable_url("meridian", "docs", "me_docs_commit_2023q2"),
        event_date=date(2023, 5, 15),
        role="signal",
        questions_served=["Q8"],
        spine_events=[],
    ),
    # Q8 signal 3: EBR PDF "next steps" slide referencing the promise
    DocEvent(
        event_id="me_pdf_ebr_2023q3",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_pdf_ebr_2023q3"),
        module="meridian_pdf",
        file_name=make_file_name("meridian_pdf", "me_pdf_ebr_2023q3", "pdf"),
        citable_url=make_citable_url("meridian", "pdf", "me_pdf_ebr_2023q3"),
        event_date=date(2023, 8, 10),
        role="signal",
        questions_served=["Q8"],
        spine_events=[],
    ),
]

# Combine all signal docs
_signal_docs: list[DocEvent] = _signal_q12 + _signal_q2 + _signal_q9 + _signal_q8

# ---- Near-miss docs ----

_near_miss_docs: list[DocEvent] = [
    # Q12 near-miss: Positive CSM Slack note from Q1 2023 — same vocabulary, positive outcome
    DocEvent(
        event_id="me_slack_near_miss_q12_2023q1",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_slack_near_miss_q12_2023q1"),
        module="meridian_slack",
        file_name=make_file_name("meridian_slack", "me_slack_near_miss_q12_2023q1", "txt"),
        citable_url=make_citable_url("meridian", "slack", "me_slack_near_miss_q12_2023q1"),
        event_date=date(2023, 2, 14),
        role="near-miss",
        questions_served=["Q12"],
        spine_events=[],
    ),
    # Q2 near-miss: Northwind renewal success email (different account, positive renewal outcome)
    # This is cross-account: uses northwind module — same renewal vocabulary, but Account A is healthy
    DocEvent(
        event_id="nw_email_renewal_success_2024",
        account_id=MERIDIAN_ACCOUNT_ID,  # NOTE: treated as near-miss in Meridian context
        entity_id=canonical_uuid("northwind", "doc:nw_email_renewal_success_2024"),  # different account namespace
        module="northwind_email",
        file_name=make_file_name("northwind_email", "nw_email_renewal_success_2024", "txt"),
        citable_url=make_citable_url("northwind", "email", "nw_email_renewal_success_2024"),
        event_date=date(2024, 6, 20),
        role="near-miss",
        questions_served=["Q2"],
        spine_events=[],
    ),
    # Q9 near-miss: High-engagement email from James Okafor 18 months ago — same champion, earlier period
    DocEvent(
        event_id="me_email_champion_active_2023q1",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_email_champion_active_2023q1"),
        module="meridian_email",
        file_name=make_file_name("meridian_email", "me_email_champion_active_2023q1", "txt"),
        citable_url=make_citable_url("meridian", "email", "me_email_champion_active_2023q1"),
        event_date=date(2023, 2, 8),
        role="near-miss",
        questions_served=["Q9"],
        spine_events=[],
    ),
    # Q8 near-miss: Meeting notes where a promise WAS logged in CRM (the non-interesting case)
    DocEvent(
        event_id="me_docs_logged_promise_2023q1",
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", "doc:me_docs_logged_promise_2023q1"),
        module="meridian_docs",
        file_name=make_file_name("meridian_docs", "me_docs_logged_promise_2023q1", "md"),
        citable_url=make_citable_url("meridian", "docs", "me_docs_logged_promise_2023q1"),
        event_date=date(2023, 2, 20),
        role="near-miss",
        questions_served=["Q8"],
        spine_events=[],
    ),
]

# ---- Noise docs (40 entries across all 4 Meridian modules) ----

def _noise_doc(
    module: str,
    slug: str,
    event_date: date,
    ext: str = "txt",
) -> DocEvent:
    """Helper to create a noise DocEvent with minimal boilerplate."""
    account_key = "meridian"
    source = module.split("_", 1)[1]  # e.g. "meridian_slack" → "slack"
    event_id = f"me_{source}_{slug}"
    return DocEvent(
        event_id=event_id,
        account_id=MERIDIAN_ACCOUNT_ID,
        entity_id=canonical_uuid("meridian", f"doc:{event_id}"),
        module=module,
        file_name=make_file_name(module, event_id, ext),
        citable_url=make_citable_url(account_key, source, event_id),
        event_date=event_date,
        role="noise",
        questions_served=[],
        spine_events=[],
    )


_noise_docs: list[DocEvent] = [
    # meridian_slack (12 entries — routine ops, onboarding, positive threads)
    _noise_doc("meridian_slack", "onboarding_welcome_2021q1", date(2021, 2, 1)),
    _noise_doc("meridian_slack", "deployment_checklist_2021q2", date(2021, 4, 12)),
    _noise_doc("meridian_slack", "enterprise_features_kickoff_2021q3", date(2021, 7, 8)),
    _noise_doc("meridian_slack", "smartgraphs_training_2021q4", date(2021, 10, 20)),
    _noise_doc("meridian_slack", "product_changelog_v3_8_2022q1", date(2022, 1, 25)),
    _noise_doc("meridian_slack", "deployment_status_2022q2", date(2022, 5, 3)),
    _noise_doc("meridian_slack", "positive_qbr_prep_2022q3", date(2022, 8, 15)),
    _noise_doc("meridian_slack", "support_case_resolved_2022q4", date(2022, 11, 7)),
    _noise_doc("meridian_slack", "renewal_thanks_2023q1", date(2023, 1, 20)),
    _noise_doc("meridian_slack", "cluster_growth_plan_2023q2", date(2023, 4, 18)),
    _noise_doc("meridian_slack", "product_release_discussion_2023q3", date(2023, 7, 14)),
    _noise_doc("meridian_slack", "health_check_routine_2024q1", date(2024, 1, 30)),
    # meridian_email (10 entries)
    _noise_doc("meridian_email", "welcome_onboarding_2021q1", date(2021, 1, 20)),
    _noise_doc("meridian_email", "quarterly_check_in_2021q3", date(2021, 8, 5)),
    _noise_doc("meridian_email", "license_renewal_confirmed_2022q1", date(2022, 1, 18)),
    _noise_doc("meridian_email", "product_update_webinar_2022q2", date(2022, 4, 28)),
    _noise_doc("meridian_email", "support_ticket_ack_2022q4", date(2022, 10, 12)),
    _noise_doc("meridian_email", "positive_qbr_recap_2023q1", date(2023, 2, 28)),
    _noise_doc("meridian_email", "partnership_anniversary_note_2023q2", date(2023, 6, 15)),
    _noise_doc("meridian_email", "product_roadmap_share_2023q4", date(2023, 11, 8)),
    _noise_doc("meridian_email", "support_case_closed_2024q1", date(2024, 2, 14)),
    _noise_doc("meridian_email", "routine_checkin_2024q2", date(2024, 5, 22)),
    # meridian_docs (10 entries, .md)
    _noise_doc("meridian_docs", "onboarding_runbook_2021q1", date(2021, 2, 10), "md"),
    _noise_doc("meridian_docs", "enterprise_feature_guide_2021q3", date(2021, 7, 25), "md"),
    _noise_doc("meridian_docs", "qbr_notes_2021q4", date(2021, 12, 10), "md"),
    _noise_doc("meridian_docs", "architecture_review_2022q1", date(2022, 2, 8), "md"),
    _noise_doc("meridian_docs", "security_audit_notes_2022q3", date(2022, 9, 5), "md"),
    _noise_doc("meridian_docs", "qbr_notes_positive_2023q2", date(2023, 5, 20), "md"),
    _noise_doc("meridian_docs", "cluster_sizing_notes_2023q3", date(2023, 8, 18), "md"),
    _noise_doc("meridian_docs", "renewal_planning_2024q1", date(2024, 1, 5), "md"),
    _noise_doc("meridian_docs", "performance_benchmarks_2024q2", date(2024, 4, 30), "md"),
    _noise_doc("meridian_docs", "routine_qbr_2024q3", date(2024, 7, 9), "md"),
    # meridian_pdf (8 entries)
    _noise_doc("meridian_pdf", "roi_report_2021", date(2021, 12, 20), "pdf"),
    _noise_doc("meridian_pdf", "ebr_deck_2022q1_positive", date(2022, 3, 15), "pdf"),
    _noise_doc("meridian_pdf", "contract_enterprise_2022_signed", date(2022, 1, 15), "pdf"),
    _noise_doc("meridian_pdf", "roi_report_2022", date(2022, 12, 12), "pdf"),
    _noise_doc("meridian_pdf", "usage_report_2023q1", date(2023, 3, 28), "pdf"),
    _noise_doc("meridian_pdf", "ebr_deck_2023q2_positive", date(2023, 6, 20), "pdf"),
    _noise_doc("meridian_pdf", "roi_report_2023", date(2023, 12, 18), "pdf"),
    _noise_doc("meridian_pdf", "usage_report_2024q2", date(2024, 6, 5), "pdf"),
]

# ---------------------------------------------------------------------------
# Assemble MERIDIAN_SPINE
# ---------------------------------------------------------------------------

MERIDIAN_SPINE: AccountSpine = AccountSpine(
    account_id=MERIDIAN_ACCOUNT_ID,
    account_name="Meridian Logistics",
    contracts=_contracts,
    usage=_usage_records,
    contacts=_contacts,
    opportunities=_opportunities,
    nps=_nps_records,
    docs=_signal_docs + _near_miss_docs + _noise_docs,
)
