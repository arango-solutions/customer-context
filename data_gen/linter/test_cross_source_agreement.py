"""
Cross-source numeric and date agreement checks.

Validates:
- Contract values agree between CRM (Opportunity close amount) and DocuSign (contract value)
- Renewal dates agree between CRM and DocuSign for the same entity_id
- NPS scores in -100..+100 range; CSAT scores in 1.0..5.0 range
"""

from datetime import datetime, date

import pytest


def _parse_date(value) -> date | None:
    """Parse a date from string or date object."""
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
    return None


def test_contract_values_consistent_across_crm_and_docusign(load_structured):
    """
    For each account, the contract value in the CRM opportunity close amount
    must match the DocuSign contract value within a 1% tolerance for rounding.

    Rationale: if the AE closes an opportunity at $500k and DocuSign shows
    $450k, the data is incoherent — the agent would report contradictory
    numbers when joining across sources.
    """
    # Build a map from entity_id → contract value for DocuSign contracts
    docusign_values: dict = {}
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "contract" not in source.lower() and "docusign" not in source.lower():
                continue
            for rec in records:
                entity_id = rec.get("entity_id", "")
                value = rec.get("value_usd") or rec.get("contract_value") or rec.get("amount")
                if entity_id and value is not None:
                    try:
                        docusign_values[entity_id] = float(value)
                    except (TypeError, ValueError):
                        pass

    if not docusign_values:
        pytest.skip("No DocuSign contract records found; cannot check cross-source value agreement")

    # Build a map from entity_id → close amount for CRM opportunities
    crm_values: dict = {}
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "opportunit" not in source.lower() and "crm" not in source.lower():
                continue
            for rec in records:
                # Opportunities reference a contract entity_id via contract_entity_id or similar
                contract_eid = (
                    rec.get("contract_entity_id")
                    or rec.get("contract_id")
                    or rec.get("entity_id")
                )
                close_amount = rec.get("close_amount") or rec.get("amount") or rec.get("value_usd")
                if contract_eid and close_amount is not None:
                    try:
                        crm_values[contract_eid] = float(close_amount)
                    except (TypeError, ValueError):
                        pass

    # If no CRM opportunity data exists yet, skip rather than fail
    if not crm_values:
        pytest.skip("No CRM opportunity amount records found; cannot check cross-source value agreement")

    violations = []
    for entity_id, crm_val in crm_values.items():
        docusign_val = docusign_values.get(entity_id)
        if docusign_val is None:
            continue  # Can't compare if there's no DocuSign record for this entity_id
        if crm_val == 0 and docusign_val == 0:
            continue
        # Allow up to 1% relative tolerance
        ref = max(abs(crm_val), abs(docusign_val))
        if ref > 0 and abs(crm_val - docusign_val) / ref > 0.01:
            violations.append(
                f"entity_id={entity_id!r}: CRM amount={crm_val:,.2f} vs "
                f"DocuSign value={docusign_val:,.2f} (diff > 1%)"
            )

    assert not violations, (
        f"Cross-source contract value mismatches ({len(violations)}):\n"
        + "\n".join(violations)
    )


def test_renewal_dates_consistent(load_structured):
    """
    Renewal dates in CRM must match DocuSign contract end_dates for the same
    entity_id, within a tolerance of 1 day (to account for timezone rounding).

    Rationale: if CRM shows renewal on 2025-01-15 and DocuSign shows 2025-02-01,
    the agent would report a contradictory renewal date depending on which graph
    it queried first.
    """
    # Build entity_id → end_date for DocuSign contracts
    docusign_end_dates: dict = {}
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "contract" not in source.lower() and "docusign" not in source.lower():
                continue
            for rec in records:
                entity_id = rec.get("entity_id", "")
                end_date = _parse_date(
                    rec.get("end_date") or rec.get("renewal_date") or rec.get("expiry_date")
                )
                if entity_id and end_date:
                    docusign_end_dates[entity_id] = end_date

    if not docusign_end_dates:
        pytest.skip("No DocuSign contract end dates found; cannot check renewal date consistency")

    # Build entity_id → renewal_date from CRM opportunities
    crm_renewal_dates: dict = {}
    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            if "opportunit" not in source.lower() and "crm" not in source.lower():
                continue
            for rec in records:
                contract_eid = (
                    rec.get("contract_entity_id")
                    or rec.get("contract_id")
                    or rec.get("entity_id")
                )
                renewal = _parse_date(rec.get("renewal_date") or rec.get("close_date"))
                if contract_eid and renewal:
                    crm_renewal_dates[contract_eid] = renewal

    if not crm_renewal_dates:
        pytest.skip("No CRM renewal date records found; cannot check renewal date consistency")

    violations = []
    for entity_id, crm_date in crm_renewal_dates.items():
        docusign_date = docusign_end_dates.get(entity_id)
        if docusign_date is None:
            continue
        diff_days = abs((crm_date - docusign_date).days)
        if diff_days > 1:
            violations.append(
                f"entity_id={entity_id!r}: CRM renewal_date={crm_date} vs "
                f"DocuSign end_date={docusign_date} (diff={diff_days} days)"
            )

    assert not violations, (
        f"Renewal date mismatches between CRM and DocuSign ({len(violations)}):\n"
        + "\n".join(violations)
    )


def test_nps_scores_in_valid_range(load_structured):
    """
    All NPS scores must be integers in [-100, +100].
    All CSAT scores must be floats in [1.0, 5.0].

    Out-of-range scores indicate a data generation error — e.g. a seeded
    random value was not clamped to the valid scale.
    """
    nps_violations = []
    csat_violations = []

    for account_bucket, sources in load_structured.items():
        for source, records in sources.items():
            for rec in records:
                # Check NPS
                nps = rec.get("nps_score") or rec.get("nps")
                if nps is not None:
                    try:
                        nps_val = int(nps)
                        if not -100 <= nps_val <= 100:
                            nps_violations.append(
                                f"[{account_bucket}/{source}] entity_id={rec.get('entity_id')!r}: "
                                f"nps_score={nps_val} is outside [-100, 100]"
                            )
                    except (TypeError, ValueError):
                        nps_violations.append(
                            f"[{account_bucket}/{source}] entity_id={rec.get('entity_id')!r}: "
                            f"nps_score={nps!r} is not a valid integer"
                        )

                # Check CSAT
                csat = rec.get("csat_score") or rec.get("csat")
                if csat is not None:
                    try:
                        csat_val = float(csat)
                        if not 1.0 <= csat_val <= 5.0:
                            csat_violations.append(
                                f"[{account_bucket}/{source}] entity_id={rec.get('entity_id')!r}: "
                                f"csat_score={csat_val} is outside [1.0, 5.0]"
                            )
                    except (TypeError, ValueError):
                        csat_violations.append(
                            f"[{account_bucket}/{source}] entity_id={rec.get('entity_id')!r}: "
                            f"csat_score={csat!r} is not a valid number"
                        )

    all_violations = nps_violations + csat_violations
    assert not all_violations, (
        f"NPS/CSAT range violations ({len(all_violations)}):\n"
        + "\n".join(all_violations)
    )
