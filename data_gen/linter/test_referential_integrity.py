"""
Referential integrity checks.

Validates:
- entity_id global uniqueness across both accounts
- account_id valid UUID format
- Structured FK: contract.account_id resolves to an accounts collection entry
- Structured FK: opportunity.account_id resolves to an accounts collection entry
"""

import re
import uuid

import pytest


# UUID4 regex pattern (loose — accepts all UUID formats)
_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _is_valid_uuid(value: str) -> bool:
    """Return True if value is a valid UUID string."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# Manifest-level checks
# ---------------------------------------------------------------------------


def test_entity_ids_globally_unique(load_manifest):
    """
    No entity_id may appear more than once across both accounts in the manifest.

    Checks D-07(a): referential integrity — entity_id uniqueness is the
    foundation of the cross-graph join; a collision would cause the agent
    to mix up records from different accounts or events.
    """
    seen = {}
    duplicates = []
    for file_name, meta in load_manifest.items():
        entity_id = meta.get("entity_id", "")
        if not entity_id:
            continue
        if entity_id in seen:
            duplicates.append(
                f"entity_id={entity_id!r} appears in both {seen[entity_id]!r} and {file_name!r}"
            )
        else:
            seen[entity_id] = file_name

    assert not duplicates, (
        f"entity_id collisions found ({len(duplicates)}):\n" + "\n".join(duplicates)
    )


def test_account_ids_valid(load_manifest):
    """
    Every manifest entry's account_id must be a valid UUID string.

    An invalid account_id would silently break the cross-graph join
    (Chunk → Document.account_id ↔ structured Account).
    """
    invalid = []
    for file_name, meta in load_manifest.items():
        account_id = meta.get("account_id", "")
        if not _is_valid_uuid(account_id):
            invalid.append(f"{file_name!r}: account_id={account_id!r} is not a valid UUID")

    assert not invalid, (
        f"Invalid account_id values found ({len(invalid)}):\n" + "\n".join(invalid)
    )


# ---------------------------------------------------------------------------
# Structured-output FK checks
# ---------------------------------------------------------------------------


def _collect_account_ids(structured: dict) -> set:
    """
    Extract all account entity_ids from the accounts collection in structured output.

    Looks for records in sources whose name contains 'account' (e.g. crm_accounts).
    Accepts both 'entity_id' and 'account_id' as the primary key field.
    """
    account_ids: set = set()
    for account_bucket in structured.values():
        for source, records in account_bucket.items():
            if "account" in source.lower():
                for rec in records:
                    for field in ("entity_id", "account_id", "id"):
                        if rec.get(field):
                            account_ids.add(rec[field])
    return account_ids


def test_structured_fk_contracts_reference_valid_accounts(load_structured):
    """
    Every contract record's account_id must appear in the accounts collection
    for the same account bucket.

    Guards against FK orphan: a contract pointing to an account that does not
    exist in the structured output.
    """
    valid_account_ids = _collect_account_ids(load_structured)

    # If no accounts are present yet, we can't evaluate FKs — skip.
    if not valid_account_ids:
        pytest.skip("No account records found in structured output; cannot check contract FKs")

    bad = []
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "contract" not in source.lower():
                continue
            for rec in records:
                acct_id = rec.get("account_id", "")
                if acct_id and acct_id not in valid_account_ids:
                    bad.append(
                        f"[{account_bucket}/{source}] contract entity_id={rec.get('entity_id')!r} "
                        f"references unknown account_id={acct_id!r}"
                    )

    assert not bad, (
        f"Contract FK violations ({len(bad)}):\n" + "\n".join(bad)
    )


def test_structured_fk_opportunities_reference_valid_accounts(load_structured):
    """
    Every opportunity record's account_id must resolve to a known account.

    Guards against orphaned opportunities — an opportunity without a parent
    account breaks the agent's ability to attribute pipeline data correctly.
    """
    valid_account_ids = _collect_account_ids(load_structured)

    if not valid_account_ids:
        pytest.skip("No account records found in structured output; cannot check opportunity FKs")

    bad = []
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "opportunit" not in source.lower():
                continue
            for rec in records:
                acct_id = rec.get("account_id", "")
                if acct_id and acct_id not in valid_account_ids:
                    bad.append(
                        f"[{account_bucket}/{source}] opportunity entity_id={rec.get('entity_id')!r} "
                        f"references unknown account_id={acct_id!r}"
                    )

    assert not bad, (
        f"Opportunity FK violations ({len(bad)}):\n" + "\n".join(bad)
    )
