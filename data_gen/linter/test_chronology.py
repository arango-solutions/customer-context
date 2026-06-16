"""
Chronology / timeline ordering checks.

Validates:
- Unstructured docs' event_date >= account's first contract signed_date
- No event_date in the manifest is after today
- UsageMetric records' period falls within at least one contract's date range
"""

from datetime import date, datetime

import pytest


def _parse_date(value) -> date | None:
    """
    Parse a date value that may be a string (ISO format) or a date object.
    Returns None if parsing fails.
    """
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m"):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
    return None


def _get_account_first_contract_dates(load_structured: dict) -> dict:
    """
    Return a dict mapping account_id → earliest contract signed_date.

    Looks for records in sources whose name contains 'contract'.
    """
    first_dates: dict = {}
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "contract" not in source.lower():
                continue
            for rec in records:
                acct_id = rec.get("account_id", "")
                signed = _parse_date(rec.get("signed_date") or rec.get("start_date"))
                if acct_id and signed:
                    if acct_id not in first_dates or signed < first_dates[acct_id]:
                        first_dates[acct_id] = signed
    return first_dates


def test_comms_after_first_contract_date(load_manifest, load_structured):
    """
    Every unstructured document's event_date must be >= its account's first
    contract signed_date.

    Rationale: an email or Slack thread from before a customer even had a
    contract is a data coherence error — it implies the relationship started
    before it did.
    """
    first_contract_dates = _get_account_first_contract_dates(load_structured)

    if not first_contract_dates:
        pytest.skip("No contract records found in structured output; cannot check chronology")

    violations = []
    for file_name, meta in load_manifest.items():
        acct_id = meta.get("account_id", "")
        event_date_raw = meta.get("event_date")
        if not acct_id or not event_date_raw:
            continue

        event_date = _parse_date(event_date_raw)
        first_date = first_contract_dates.get(acct_id)

        if event_date and first_date and event_date < first_date:
            violations.append(
                f"{file_name!r}: event_date={event_date} predates first contract "
                f"signed_date={first_date} for account_id={acct_id!r}"
            )

    assert not violations, (
        f"Chronology violations (docs before first contract) — {len(violations)}:\n"
        + "\n".join(violations)
    )


def test_no_future_event_dates(load_manifest):
    """
    No event_date in the manifest may be after today's date.

    A future-dated document is a data coherence error: it implies an event
    that has not yet happened. All synthetic data is historical.
    """
    today = date.today()
    violations = []
    for file_name, meta in load_manifest.items():
        event_date_raw = meta.get("event_date")
        if not event_date_raw:
            continue
        event_date = _parse_date(event_date_raw)
        if event_date and event_date > today:
            violations.append(
                f"{file_name!r}: event_date={event_date} is in the future (today={today})"
            )

    assert not violations, (
        f"Future event_date violations — {len(violations)}:\n" + "\n".join(violations)
    )


def test_usage_metrics_within_contract_period(load_structured):
    """
    Every UsageMetric record's period must fall within at least one Contract's
    date range for the same account.

    Rationale: usage telemetry cannot exist for a period before any contract
    was signed or after all contracts have expired — that would be a data
    coherence error implying the customer used the product without a contract.
    """
    # Build contracts per account: list of (start_date, end_date) tuples
    contracts_by_account: dict = {}
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "contract" not in source.lower():
                continue
            for rec in records:
                acct_id = rec.get("account_id", "")
                start = _parse_date(rec.get("signed_date") or rec.get("start_date"))
                end = _parse_date(rec.get("end_date") or rec.get("renewal_date"))
                if acct_id and start:
                    contracts_by_account.setdefault(acct_id, []).append((start, end))

    if not contracts_by_account:
        pytest.skip("No contract records found in structured output; cannot check UsageMetric bounds")

    violations = []
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "usage" not in source.lower() and "metric" not in source.lower():
                continue
            for rec in records:
                acct_id = rec.get("account_id", "")
                period_raw = rec.get("period") or rec.get("period_start")
                if not acct_id or not period_raw:
                    continue

                period_date = _parse_date(period_raw)
                if not period_date:
                    continue

                account_contracts = contracts_by_account.get(acct_id, [])
                if not account_contracts:
                    violations.append(
                        f"UsageMetric period={period_raw} for account_id={acct_id!r} "
                        f"has no associated contracts"
                    )
                    continue

                # Check if the period falls within any contract range
                covered = False
                for start, end in account_contracts:
                    if period_date >= start and (end is None or period_date <= end):
                        covered = True
                        break

                if not covered:
                    violations.append(
                        f"UsageMetric period={period_raw} for account_id={acct_id!r} "
                        f"does not fall within any contract period "
                        f"(contracts: {[(str(s), str(e)) for s, e in account_contracts]})"
                    )

    assert not violations, (
        f"UsageMetric outside contract period — {len(violations)}:\n"
        + "\n".join(violations)
    )
