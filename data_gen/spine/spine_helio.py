"""
Helio Retail event spine — Account C (churn / usage-and-revenue CONTRACTION).

Helio Retail is an e-commerce / retail-personalization vertical (product-recommendation
graph use case) — deliberately distinct from Northwind Analytics and Meridian Logistics
(D-02). Its risk signature is HONEST DECLINE: usage rises to a peak then falls, the plan is
downgraded (ArangoGraph -> Enterprise, lower value_usd, auto_renew=False), an expansion is
lost, the current renewal is at risk, and NPS score AND verbatim_sentiment fall TOGETHER
(8/positive -> 3/negative). This is the load-bearing D-03 distinction from Meridian's Q12
(green-score / red-sentiment contradiction): there is no contradiction here — every number is
dropping. The demo triad: Northwind grows (A), Meridian holds-but-grumbles (B), Helio slips (C).

Key questions served: Q13 (flagship dual-graph churn/contraction), Q14 (remediation / save-plan
follow-up), Q15 (structured-only anchor — mirrors Q7's role for Northwind).

Signal-doc vocabulary centers on contraction / downgrade / migration-away / declining-usage /
deprioritization — lexically distinct from Meridian's renewal-pricing-objection / champion-quiet
and Northwind's scale-limit / GenAI (RESEARCH Pitfall 3, anti-collision under RRF).

All entity_ids use canonical_uuid("helio", ...).
All file_names use make_file_name(module, event_id, ext).
All citable_urls use make_citable_url("helio", source, event_id).

No Faker dependency — all hard facts are literal values.
"""

from datetime import date

from data_gen.spine.entity_registry import (
    HELIO_ACCOUNT_ID,
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
# Contracts — land Enterprise, expand to ArangoGraph at peak, then DOWNGRADE
# back to Enterprise (lower value, auto_renew=False), with a final at-risk renewal.
# This downgrade ladder is the structural contraction signature absent from
# Northwind (only climbs) and Meridian (flat Enterprise).
# ---------------------------------------------------------------------------

_contracts: list[ContractEvent] = [
    # Initial land — Enterprise
    ContractEvent(
        event_id="he_contract_enterprise_2022",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "contract:enterprise_2022"),
        signed_date=date(2022, 1, 15),
        end_date=date(2023, 1, 14),
        value_usd=150_000,
        product_scope=ArangoEdition.Enterprise,
        auto_renew=True,
    ),
    # Expansion to ArangoGraph at peak adoption (2023)
    ContractEvent(
        event_id="he_contract_arangograph_2023",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "contract:arangograph_2023"),
        signed_date=date(2023, 1, 15),
        end_date=date(2024, 1, 14),
        value_usd=240_000,
        product_scope=ArangoEdition.ArangoGraph,
        auto_renew=True,
    ),
    # DOWNGRADE — ArangoGraph -> Enterprise; lower value_usd, auto_renew=False (renewal at risk)
    ContractEvent(
        event_id="he_contract_downgrade_2024",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "contract:downgrade_2024"),
        signed_date=date(2024, 3, 1),
        end_date=date(2025, 2, 28),
        value_usd=110_000,  # contraction: well below the 240k ArangoGraph peak
        product_scope=ArangoEdition.Enterprise,
        auto_renew=False,  # the renewal-at-risk signal
    ),
]

# ---------------------------------------------------------------------------
# Usage — RISE to a peak then FALL (the structural churn signature, D-03).
# query_volume_m: 6.0 -> 12.0 peak -> 4.5 trough; cluster_nodes shrink 6 -> 10 -> 6 -> 4.
# Northwind/Meridian both monotonically rise — a *declining* tail is unambiguously Helio's.
# ---------------------------------------------------------------------------

def _usage(
    period: str,
    qvol: float,
    nodes: int,
    edition: ArangoEdition,
    graphrag: bool = False,
) -> UsageEvent:
    return UsageEvent(
        event_id=f"he_usage_{period.lower().replace('-', '_')}",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"usage:{period}"),
        period=period,
        query_volume_m=round(qvol, 2),
        cluster_nodes=nodes,
        edition=edition,
        smartgraphs_enabled=True,
        graphrag_enabled=graphrag,
    )


_usage_records: list[UsageEvent] = [
    # Rise — Enterprise land, ramping adoption
    _usage("2022-Q1", 6.00, 6, ArangoEdition.Enterprise),
    _usage("2022-Q2", 7.20, 6, ArangoEdition.Enterprise),
    _usage("2022-Q3", 9.00, 8, ArangoEdition.Enterprise),
    _usage("2022-Q4", 11.00, 8, ArangoEdition.Enterprise),
    # Peak — ArangoGraph expansion, GraphRAG enabled
    _usage("2023-Q1", 12.00, 10, ArangoEdition.ArangoGraph, graphrag=True),
    _usage("2023-Q2", 11.50, 10, ArangoEdition.ArangoGraph, graphrag=True),
    # Decline begins — engagement falls off, nodes start shrinking
    _usage("2023-Q3", 9.50, 8, ArangoEdition.ArangoGraph, graphrag=True),
    _usage("2023-Q4", 8.00, 8, ArangoEdition.ArangoGraph, graphrag=False),
    # Downgrade to Enterprise, continued contraction
    _usage("2024-Q1", 6.00, 6, ArangoEdition.Enterprise),
    _usage("2024-Q2", 4.50, 4, ArangoEdition.Enterprise),  # trough
]

# ---------------------------------------------------------------------------
# Contacts — champion departs (the human side of the contraction), economic
# buyer reprioritizes budget away from the platform.
# ---------------------------------------------------------------------------

_contacts: list[ContactEvent] = [
    # Original champion — leaves the company mid-decline (loss of internal advocate)
    ContactEvent(
        event_id="he_contact_priya_nair",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "contact:priya_nair"),
        full_name="Priya Nair",
        title="Head of Personalization",
        role="champion",
        email="p.nair@helioretail.com",
        active_from=date(2022, 1, 15),
        active_to=date(2023, 11, 30),  # departs — advocacy lost going into the downgrade
    ),
    # Replacement owner — deprioritizes the graph platform in favor of a migration
    ContactEvent(
        event_id="he_contact_marcus_webb",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "contact:marcus_webb"),
        full_name="Marcus Webb",
        title="VP Engineering",
        role="user",
        email="m.webb@helioretail.com",
        active_from=date(2023, 12, 1),
        active_to=None,
    ),
    # Economic buyer — stable seat, but reallocating budget (cost-pressure driver)
    ContactEvent(
        event_id="he_contact_diane_choi",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "contact:diane_choi"),
        full_name="Diane Choi",
        title="CFO",
        role="economic_buyer",
        email="d.choi@helioretail.com",
        active_from=date(2022, 1, 15),
        active_to=None,
    ),
]

# ---------------------------------------------------------------------------
# Opportunities — land, expand (won), then a LOST expansion and a SLIPPED /
# at-risk renewal. Distinct from Meridian's single lost expansion on a renewing base.
# ---------------------------------------------------------------------------

_opportunities: list[OpportunityEvent] = [
    # Initial land — Enterprise
    OpportunityEvent(
        event_id="he_opp_new_2022",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "opportunity:new_2022"),
        stage="closed-won",
        close_date=date(2022, 1, 15),
        amount_usd=150_000,
        opportunity_type="new",
        product_scope=ArangoEdition.Enterprise,
        contract_entity_id=canonical_uuid("helio", "contract:enterprise_2022"),
        renewal_date=date(2023, 1, 14),
    ),
    # Expansion to ArangoGraph — won at peak
    OpportunityEvent(
        event_id="he_opp_expansion_2023_won",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "opportunity:expansion_2023_won"),
        stage="closed-won",
        close_date=date(2023, 1, 15),
        amount_usd=240_000,
        opportunity_type="expansion",
        product_scope=ArangoEdition.ArangoGraph,
        contract_entity_id=canonical_uuid("helio", "contract:arangograph_2023"),
        renewal_date=date(2024, 1, 14),
    ),
    # Further GenAI expansion attempt — closed-LOST (the growth that never lands)
    OpportunityEvent(
        event_id="he_opp_expansion_2023_lost",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "opportunity:expansion_2023_lost"),
        stage="closed-lost",
        close_date=date(2023, 10, 15),
        amount_usd=90_000,
        opportunity_type="expansion",
        product_scope=ArangoEdition.GenAI,
        contract_entity_id=None,  # closed-lost — no contract signed
        renewal_date=None,
    ),
    # Downgrade renewal (2024) — closed-won but at a LOWER value (the contraction renewal)
    OpportunityEvent(
        event_id="he_opp_downgrade_2024",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "opportunity:downgrade_2024"),
        stage="closed-won",
        close_date=date(2024, 3, 1),
        amount_usd=110_000,
        opportunity_type="renewal",
        product_scope=ArangoEdition.Enterprise,
        contract_entity_id=canonical_uuid("helio", "contract:downgrade_2024"),
        renewal_date=date(2025, 2, 28),
    ),
    # Current 2025 renewal — at risk / slipping (auto_renew=False; migration discussion live)
    OpportunityEvent(
        event_id="he_opp_renewal_2025_at_risk",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "opportunity:renewal_2025_at_risk"),
        stage="negotiation",
        close_date=date(2025, 1, 15),
        amount_usd=80_000,  # further contraction expected if it renews at all
        opportunity_type="renewal",
        product_scope=ArangoEdition.Enterprise,
        contract_entity_id=None,  # not yet signed — renewal at risk
        renewal_date=None,
    ),
]

# ---------------------------------------------------------------------------
# NPS — score AND sentiment both decline TOGETHER (8/positive -> 3/negative).
# This is the load-bearing D-03 distinction from Meridian's Q12 (green score /
# red sentiment): no contradiction here — every number drops in lockstep.
# ---------------------------------------------------------------------------

def _nps(
    period: str,
    score: int,
    sentiment: str,
    survey_date: date,
) -> NpsEvent:
    return NpsEvent(
        event_id=f"he_nps_{period.lower().replace('-', '_')}",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"nps:{period}"),
        score=score,
        verbatim_sentiment=sentiment,
        survey_date=survey_date,
        survey_period=period,
    )


_nps_records: list[NpsEvent] = [
    # 2022 — healthy adoption, positive
    _nps("2022-Q1", 8, "positive", date(2022, 3, 31)),
    _nps("2022-Q2", 8, "positive", date(2022, 6, 30)),
    _nps("2022-Q4", 7, "positive", date(2022, 12, 31)),
    # 2023 — peak then the turn; score AND sentiment begin to fall together
    _nps("2023-Q1", 7, "positive", date(2023, 3, 31)),
    _nps("2023-Q3", 6, "neutral", date(2023, 9, 30)),  # both soften
    # 2024 — honest decline: low score AND negative sentiment (NO contradiction)
    _nps("2024-Q1", 4, "negative", date(2024, 3, 31)),
    _nps("2024-Q2", 3, "negative", date(2024, 6, 30)),  # trough — both at bottom
]

# ---------------------------------------------------------------------------
# DocEvents — signal, near-miss, noise
# ---------------------------------------------------------------------------

# ---- Signal docs for Q13 (flagship dual-graph: churn / contraction, all 4 modules) ----

_signal_q13: list[DocEvent] = [
    # Q13 signal 1: Slack escalation — usage declining, team migrating away to a managed service
    DocEvent(
        event_id="he_slack_contraction_2024q1",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_slack_contraction_2024q1"),
        module="helio_slack",
        file_name=make_file_name("helio_slack", "he_slack_contraction_2024q1", "txt"),
        citable_url=make_citable_url("helio", "slack", "he_slack_contraction_2024q1"),
        event_date=date(2024, 2, 20),
        role="signal",
        questions_served=["Q13"],
        spine_events=["he_usage_2024_q1", "he_contract_downgrade_2024"],
    ),
    # Q13 signal 2: Downgrade-rationale email — VP Eng explains the plan downgrade + migration intent
    DocEvent(
        event_id="he_email_downgrade_rationale_2024q1",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_email_downgrade_rationale_2024q1"),
        module="helio_email",
        file_name=make_file_name("helio_email", "he_email_downgrade_rationale_2024q1", "txt"),
        citable_url=make_citable_url("helio", "email", "he_email_downgrade_rationale_2024q1"),
        event_date=date(2024, 2, 28),
        role="signal",
        questions_served=["Q13"],
        spine_events=["he_contract_downgrade_2024", "he_contact_marcus_webb"],
    ),
    # Q13 signal 3: QBR doc — declining usage trend + deprioritization of the graph platform
    DocEvent(
        event_id="he_docs_qbr_decline_2024q1",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_docs_qbr_decline_2024q1"),
        module="helio_docs",
        file_name=make_file_name("helio_docs", "he_docs_qbr_decline_2024q1", "md"),
        citable_url=make_citable_url("helio", "docs", "he_docs_qbr_decline_2024q1"),
        event_date=date(2024, 1, 25),
        role="signal",
        questions_served=["Q13"],
        spine_events=["he_usage_2023_q4", "he_nps_2024_q1"],
    ),
    # Q13 signal 4: Churn-risk EBR PDF — contraction summary slide, renewal at risk
    DocEvent(
        event_id="he_pdf_churn_risk_2024q2",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_pdf_churn_risk_2024q2"),
        module="helio_pdf",
        file_name=make_file_name("helio_pdf", "he_pdf_churn_risk_2024q2", "pdf"),
        citable_url=make_citable_url("helio", "pdf", "he_pdf_churn_risk_2024q2"),
        event_date=date(2024, 5, 1),
        role="signal",
        questions_served=["Q13"],
        spine_events=["he_usage_2024_q2", "he_nps_2024_q2", "he_opp_renewal_2025_at_risk"],
    ),
]

# ---- Signal docs for Q14 (remediation / save-plan follow-up) ----

_signal_q14: list[DocEvent] = [
    # Q14 signal 1: CSM save-plan doc — remediation steps to halt the contraction
    DocEvent(
        event_id="he_docs_save_plan_2024q2",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_docs_save_plan_2024q2"),
        module="helio_docs",
        file_name=make_file_name("helio_docs", "he_docs_save_plan_2024q2", "md"),
        citable_url=make_citable_url("helio", "docs", "he_docs_save_plan_2024q2"),
        event_date=date(2024, 5, 10),
        role="signal",
        questions_served=["Q14"],
        spine_events=["he_opp_renewal_2025_at_risk", "he_usage_2024_q2"],
    ),
    # Q14 signal 2: Slack thread — CSM coordinating the remediation / save play with the account team
    DocEvent(
        event_id="he_slack_remediation_2024q2",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_slack_remediation_2024q2"),
        module="helio_slack",
        file_name=make_file_name("helio_slack", "he_slack_remediation_2024q2", "txt"),
        citable_url=make_citable_url("helio", "slack", "he_slack_remediation_2024q2"),
        event_date=date(2024, 5, 15),
        role="signal",
        questions_served=["Q14"],
        spine_events=["he_opp_renewal_2025_at_risk"],
    ),
]

# Combine all signal docs (Q15 is structured-only — it has NO signal docs by design)
_signal_docs: list[DocEvent] = _signal_q13 + _signal_q14

# ---- Near-miss docs (same Helio contraction vocabulary, but positive / non-churn outcome) ----

_near_miss_docs: list[DocEvent] = [
    # Q13 near-miss 1: 2022 Slack thread — same usage/adoption vocabulary, but during the HEALTHY rise
    DocEvent(
        event_id="he_slack_near_miss_growth_2022q3",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_slack_near_miss_growth_2022q3"),
        module="helio_slack",
        file_name=make_file_name("helio_slack", "he_slack_near_miss_growth_2022q3", "txt"),
        citable_url=make_citable_url("helio", "slack", "he_slack_near_miss_growth_2022q3"),
        event_date=date(2022, 8, 12),
        role="near-miss",
        questions_served=["Q13"],
        spine_events=[],
    ),
    # Q13 near-miss 2: 2023 expansion-win email — upgrade/expansion vocabulary, opposite of churn
    DocEvent(
        event_id="he_email_near_miss_expansion_2023q1",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_email_near_miss_expansion_2023q1"),
        module="helio_email",
        file_name=make_file_name("helio_email", "he_email_near_miss_expansion_2023q1", "txt"),
        citable_url=make_citable_url("helio", "email", "he_email_near_miss_expansion_2023q1"),
        event_date=date(2023, 1, 18),
        role="near-miss",
        questions_served=["Q13"],
        spine_events=[],
    ),
    # Q13 near-miss 3: 2023 peak QBR doc — strong adoption, positive trajectory (pre-decline)
    DocEvent(
        event_id="he_docs_near_miss_peak_qbr_2023q1",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_docs_near_miss_peak_qbr_2023q1"),
        module="helio_docs",
        file_name=make_file_name("helio_docs", "he_docs_near_miss_peak_qbr_2023q1", "md"),
        citable_url=make_citable_url("helio", "docs", "he_docs_near_miss_peak_qbr_2023q1"),
        event_date=date(2023, 2, 10),
        role="near-miss",
        questions_served=["Q13"],
        spine_events=[],
    ),
    # Q14 near-miss: a routine account-plan doc with no remediation (the non-save case)
    DocEvent(
        event_id="he_docs_near_miss_routine_plan_2022q4",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", "doc:he_docs_near_miss_routine_plan_2022q4"),
        module="helio_docs",
        file_name=make_file_name("helio_docs", "he_docs_near_miss_routine_plan_2022q4", "md"),
        citable_url=make_citable_url("helio", "docs", "he_docs_near_miss_routine_plan_2022q4"),
        event_date=date(2022, 11, 8),
        role="near-miss",
        questions_served=["Q14"],
        spine_events=[],
    ),
]

# ---- Noise docs (routine ops across all 4 Helio modules — no contraction lexicon) ----

def _noise_doc(
    module: str,
    slug: str,
    event_date: date,
    ext: str = "txt",
) -> DocEvent:
    """Helper to create a noise DocEvent with minimal boilerplate."""
    account_key = "helio"
    source = module.split("_", 1)[1]  # e.g. "helio_slack" → "slack"
    event_id = f"he_{source}_{slug}"
    return DocEvent(
        event_id=event_id,
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"doc:{event_id}"),
        module=module,
        file_name=make_file_name(module, event_id, ext),
        citable_url=make_citable_url(account_key, source, event_id),
        event_date=event_date,
        role="noise",
        questions_served=[],
        spine_events=[],
    )


_noise_docs: list[DocEvent] = [
    # helio_slack (8 entries — routine ops, onboarding, positive threads)
    _noise_doc("helio_slack", "onboarding_welcome_2022q1", date(2022, 2, 1)),
    _noise_doc("helio_slack", "deployment_checklist_2022q1", date(2022, 2, 18)),
    _noise_doc("helio_slack", "recommendation_graph_kickoff_2022q2", date(2022, 5, 9)),
    _noise_doc("helio_slack", "smartgraphs_training_2022q3", date(2022, 8, 22)),
    _noise_doc("helio_slack", "product_changelog_v3_9_2022q4", date(2022, 11, 14)),
    _noise_doc("helio_slack", "peak_season_readiness_2023q1", date(2023, 3, 6)),
    _noise_doc("helio_slack", "support_case_resolved_2023q2", date(2023, 6, 19)),
    _noise_doc("helio_slack", "routine_health_check_2023q3", date(2023, 8, 28)),
    # helio_email (7 entries)
    _noise_doc("helio_email", "welcome_onboarding_2022q1", date(2022, 1, 20)),
    _noise_doc("helio_email", "quarterly_check_in_2022q2", date(2022, 5, 5)),
    _noise_doc("helio_email", "license_confirmation_2022q3", date(2022, 8, 8)),
    _noise_doc("helio_email", "product_update_webinar_2022q4", date(2022, 10, 28)),
    _noise_doc("helio_email", "peak_adoption_recap_2023q1", date(2023, 2, 27)),
    _noise_doc("helio_email", "support_ticket_ack_2023q2", date(2023, 6, 12)),
    _noise_doc("helio_email", "routine_checkin_2023q3", date(2023, 9, 14)),
    # helio_docs (7 entries, .md)
    _noise_doc("helio_docs", "onboarding_runbook_2022q1", date(2022, 2, 10), "md"),
    _noise_doc("helio_docs", "recommendation_use_case_guide_2022q2", date(2022, 5, 25), "md"),
    _noise_doc("helio_docs", "architecture_review_2022q3", date(2022, 9, 5), "md"),
    _noise_doc("helio_docs", "security_audit_notes_2022q4", date(2022, 11, 18), "md"),
    _noise_doc("helio_docs", "peak_performance_benchmarks_2023q1", date(2023, 3, 18), "md"),
    _noise_doc("helio_docs", "cluster_sizing_notes_2023q2", date(2023, 6, 8), "md"),
    _noise_doc("helio_docs", "routine_runbook_update_2023q3", date(2023, 9, 1), "md"),
    # helio_pdf (6 entries)
    _noise_doc("helio_pdf", "roi_report_2022", date(2022, 12, 20), "pdf"),
    _noise_doc("helio_pdf", "ebr_deck_2022q3_positive", date(2022, 9, 15), "pdf"),
    _noise_doc("helio_pdf", "contract_enterprise_2022_signed", date(2022, 1, 15), "pdf"),
    _noise_doc("helio_pdf", "peak_usage_report_2023q1", date(2023, 3, 28), "pdf"),
    _noise_doc("helio_pdf", "ebr_deck_2023q1_positive", date(2023, 2, 20), "pdf"),
    _noise_doc("helio_pdf", "roi_report_2023", date(2023, 7, 12), "pdf"),
]

# ---------------------------------------------------------------------------
# Assemble HELIO_SPINE
# ---------------------------------------------------------------------------

HELIO_SPINE: AccountSpine = AccountSpine(
    account_id=HELIO_ACCOUNT_ID,
    account_name="Helio Retail",
    contracts=_contracts,
    usage=_usage_records,
    contacts=_contacts,
    opportunities=_opportunities,
    nps=_nps_records,
    docs=_signal_docs + _near_miss_docs + _noise_docs,
)
