"""
Canonical event dataclasses and ArangoEdition enum for Customer 360 synthetic data.

All downstream generators import from this module. No Faker dependency — pure
Python stdlib only (dataclasses, datetime, enum, typing).

Design notes:
- ArangoEdition mirrors the product-ladder from the data map (Community → Enterprise
  → ArangoGraph → GenAI) — used by ContractEvent, UsageEvent, OpportunityEvent.
- DocEvent.role is NOT stored in citable_url or doc body (D-09 constraint): "signal",
  "noise", or "near-miss" are generation-manifest fields only.
- DocEvent.questions_served lists the Q-IDs this doc is designed to help answer.
- DocEvent.spine_events links back to the structured event_ids that this doc's
  content is derived from (empty list = noise/near-miss with no spine linkage).
- AccountSpine is the top-level container; one instance per account.
"""

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class ArangoEdition(str, Enum):
    """ArangoDB product-ladder editions, matching the locked data map."""

    Community = "Community"
    Enterprise = "Enterprise"
    ArangoGraph = "ArangoGraph"
    GenAI = "GenAI"


# ---------------------------------------------------------------------------
# Structured event dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ContractEvent:
    """
    Represents a DocuSign contract or amendment.

    entity_id: canonical_uuid("account_scope", "contract_identifier")
    product_scope: the ArangoEdition this contract licenses
    value_usd: annual contract value in USD (0 for Community)
    auto_renew: whether the contract auto-renews at end_date
    """

    event_id: str
    account_id: str
    entity_id: str
    signed_date: date
    end_date: date
    value_usd: int
    product_scope: ArangoEdition
    auto_renew: bool


@dataclass
class UsageEvent:
    """
    Represents a Snowflake quarterly usage telemetry record.

    period: ISO-style quarter string, e.g. "2024-Q3"
    query_volume_m: average monthly query volume in millions
    cluster_nodes: total node count in the ArangoDB cluster
    edition: ArangoEdition currently in use this period
    smartgraphs_enabled: whether SmartGraphs feature is active
    graphrag_enabled: whether GraphRAG/GenAI suite is active (whitespace signal)
    """

    event_id: str
    account_id: str
    entity_id: str
    period: str
    query_volume_m: float
    cluster_nodes: int
    edition: ArangoEdition
    smartgraphs_enabled: bool
    graphrag_enabled: bool


@dataclass
class ContactEvent:
    """
    Represents a CRM Contact record (champion, economic buyer, or user).

    role: "champion" | "economic_buyer" | "user"
    active_to: None if the contact is still active; set to disengagement date
    """

    event_id: str
    account_id: str
    entity_id: str
    full_name: str
    title: str
    role: str
    email: str
    active_from: date
    active_to: Optional[date]


@dataclass
class OpportunityEvent:
    """
    Represents a CRM Opportunity (new sale, renewal, or expansion).

    opportunity_type: "new" | "renewal" | "expansion"
    stage: CRM stage string (e.g. "closed-won", "closed-lost", "proposal", "negotiation")
    """

    event_id: str
    account_id: str
    entity_id: str
    stage: str
    close_date: date
    amount_usd: int
    opportunity_type: str
    product_scope: ArangoEdition


@dataclass
class NpsEvent:
    """
    Represents a CRM NPS/CSAT survey response.

    score: NPS score 0-10
    verbatim_sentiment: overall sentiment of the free-text verbatim comment
                        ("positive" | "neutral" | "negative")
    survey_period: quarter string aligned to UsageEvent.period, e.g. "2024-Q3"

    Key Q12 design: score can be 7-8 (green/acceptable) while verbatim_sentiment
    is "negative" — the structured side shows green, the unstructured side shows red.
    The NPS verbatim TEXT is a DocEvent (role="signal"); this record holds the score.
    """

    event_id: str
    account_id: str
    entity_id: str
    score: int
    verbatim_sentiment: str
    survey_date: date
    survey_period: str


@dataclass
class DocEvent:
    """
    Represents a generated unstructured document (Slack thread, email, Google Doc, PDF).

    module: one of the 8 locked MODULE_NAMES (e.g. "northwind_slack")
    file_name: deterministic from make_file_name(module, event_id, ext)
    citable_url: from make_citable_url(account_key, source, event_id)
    role: "signal" | "noise" | "near-miss" — generation manifest field only (D-09)
    questions_served: list of Q-IDs this document is designed to help answer ([] for noise)
    spine_events: list of structured event_ids this document's content is derived from
                  ([] for noise/near-miss — they are NOT spine-derived)
    """

    event_id: str
    account_id: str
    entity_id: str
    module: str
    file_name: str
    citable_url: str
    event_date: date
    role: str
    questions_served: list[str] = field(default_factory=list)
    spine_events: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level container
# ---------------------------------------------------------------------------


@dataclass
class AccountSpine:
    """
    Complete multi-year event spine for one account.

    One instance per account (Northwind and Meridian).
    All downstream generators iterate over the appropriate list.
    """

    account_id: str
    account_name: str
    contracts: list[ContractEvent]
    usage: list[UsageEvent]
    contacts: list[ContactEvent]
    opportunities: list[OpportunityEvent]
    nps: list[NpsEvent]
    docs: list[DocEvent]
