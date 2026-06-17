"""
Chronology / timeline ordering checks.

Validates:
- Unstructured docs' event_date >= account's first contract signed_date
- No event_date in the manifest is after today
- UsageMetric records' period falls within at least one contract's date range
"""

from datetime import date, datetime

import pytest


# Quarter-end (month, day) for each quarter label — used by _parse_quarter.
# We map to the END of the quarter so that a usage record for "YYYY-Qn" is
# considered covered as long as an active contract exists before the quarter ends.
# This is the correct semantic: a customer who signed on Jan 15 has Q1 usage covered.
_QUARTER_END: dict = {
    "Q1": (3, 31),
    "Q2": (6, 30),
    "Q3": (9, 30),
    "Q4": (12, 31),
}


def _parse_quarter(value: str) -> "date | None":
    """
    Parse a quarter string like "2024-Q3" to its quarter END date.

    Mapping: Q1→Mar 31, Q2→Jun 30, Q3→Sep 30, Q4→Dec 31.
    Returns None if the value does not match the expected pattern.
    """
    parts = value.split("-")
    if len(parts) == 2 and parts[1] in _QUARTER_END:
        try:
            year = int(parts[0])
            month, day = _QUARTER_END[parts[1]]
            return date(year, month, day)
        except ValueError:
            pass
    return None


def _parse_date(value) -> "date | None":
    """
    Parse a date value that may be a string (ISO format), a quarter string
    ("YYYY-Qn"), or a date object.  Returns None if parsing fails.

    Quarter strings are mapped to their START date:
      "2024-Q3" → date(2024, 7, 1)
    """
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        # Try standard ISO-style formats first
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m"):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
        # Try quarter format "YYYY-Qn"
        quarter_date = _parse_quarter(value)
        if quarter_date is not None:
            return quarter_date
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
    records_checked = 0  # guard against vacuous pass
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
                    violations.append(
                        f"UsageMetric period={period_raw!r} for account_id={acct_id!r} "
                        f"could not be parsed as a date — fix _parse_date or the data"
                    )
                    continue

                records_checked += 1
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

    # Non-vacuous guard: if usage records exist but none were checked, the parser
    # failed to interpret every period string — that itself is a defect.
    assert records_checked > 0, (
        "No UsageMetric records were actually checked (all period values failed to parse). "
        "Ensure _parse_date handles the period format used in the generated data."
    )

    assert not violations, (
        f"UsageMetric outside contract period — {len(violations)}:\n"
        + "\n".join(violations)
    )
