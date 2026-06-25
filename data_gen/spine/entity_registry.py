"""
Master entity registry for the Customer 360 synthetic data generation.

Defines all global constants and ID-generation functions.
No Faker dependency — pure Python stdlib only (uuid, hashlib).

Key invariants:
- canonical_uuid is always account-scoped (prevents cross-account collision — RESEARCH.md Pitfall 5)
- MODULE_NAMES is the single source of truth for the 8 locked module strings (one-way door)
- make_file_name is deterministic: same (module, event_id) always produces the same file_name
- CITABLE_URL_BASE prefix is asserted by the linter (test_citable_url_prefix)
"""

import hashlib
import uuid

# ---------------------------------------------------------------------------
# Global constants
# ---------------------------------------------------------------------------

GLOBAL_SEED: int = 42

# Standard URL namespace (RFC 4122 §4.3) — used by uuid.uuid5 for deterministic UUIDs
NAMESPACE: uuid.UUID = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# Base URL for all citable_url values — linter asserts every URL starts with this prefix
CITABLE_URL_BASE: str = "https://arangodb.com/demo/"

# ---------------------------------------------------------------------------
# Canonical UUID generation (account-scoped)
# ---------------------------------------------------------------------------


def canonical_uuid(scope: str, name: str) -> str:
    """
    Deterministic UUID from (scope, name).

    Always account-scoped to prevent cross-account entity_id collisions.
    Example: canonical_uuid("northwind", "contact_sarah_chen")
             canonical_uuid("meridian", "contact_sarah_chen")
    These produce different UUIDs even if the name portion is identical.

    Uses uuid.uuid5 so the same inputs always produce the same output,
    regardless of run order or seed state.
    """
    return str(uuid.uuid5(NAMESPACE, f"{scope}:{name}"))


# ---------------------------------------------------------------------------
# Account IDs
# ---------------------------------------------------------------------------

NORTHWIND_ACCOUNT_ID: str = canonical_uuid("northwind", "northwind_analytics")
MERIDIAN_ACCOUNT_ID: str = canonical_uuid("meridian", "meridian_logistics")
HELIO_ACCOUNT_ID: str = canonical_uuid("helio", "helio_retail")

# ---------------------------------------------------------------------------
# Locked module names — 12 modules (3 accounts x 4 sources), one-way door (UPDATE-PIPELINE.md)
# ---------------------------------------------------------------------------

MODULE_NAMES: list[str] = [
    "northwind_slack",
    "northwind_email",
    "northwind_docs",
    "northwind_pdf",
    "meridian_slack",
    "meridian_email",
    "meridian_docs",
    "meridian_pdf",
    "helio_slack",
    "helio_email",
    "helio_docs",
    "helio_pdf",
]

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def make_file_name(module: str, event_id: str, ext: str) -> str:
    """
    Deterministic file_name from (module, event_id).

    Same inputs always produce the same output — idempotent generation.
    Slug is the first 12 hex characters of SHA-256(module:event_id).

    Format: {module}_{event_id}_{slug}.{ext}
    Example: northwind_slack_nw_slack_scale_limit_2024q2_8b4f0a65075f.txt

    Note on AutoGraph naming convention (RESEARCH.md Pattern 2):
    - Layer-2 sources collection uses 'filename' (no underscore)
    - Layer-3 {proj}_Documents uses 'file_name' (with underscore)
    - Phase 3 UPSERT keys on 'file_name'; import payload uses 'filename'
    - Both values are always the same string (this function's return value)
    """
    slug = hashlib.sha256(f"{module}:{event_id}".encode()).hexdigest()[:12]
    return f"{module}_{event_id}_{slug}.{ext}"


def make_citable_url(account_key: str, source: str, event_id: str) -> str:
    """
    Construct a citable_url for a generated document.

    Format: {CITABLE_URL_BASE}{account_key}/{source}/{event_id}
    Example: https://arangodb.com/demo/northwind/slack/nw_slack_scale_limit_2024q2

    account_key: "northwind" or "meridian"
    source: source system slug (e.g. "slack", "email", "docs", "pdf")
    event_id: the event_id from the DocEvent
    """
    return f"{CITABLE_URL_BASE}{account_key}/{source}/{event_id}"


def canonical_entity_id(account: str, entity_type: str, name: str) -> str:
    """
    Convenience wrapper: canonical_uuid scoped by account + entity_type + name.

    Example: canonical_entity_id("northwind", "contact", "sarah_chen")
    Equivalent to: canonical_uuid("northwind", "contact:sarah_chen")
    """
    return canonical_uuid(account, f"{entity_type}:{name}")
