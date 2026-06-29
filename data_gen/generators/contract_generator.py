"""
DocuSign contract generator.

Reads AccountSpine and emits one JSON file per account:
  {account_key}_docusign_contracts.json

No LLM calls — pure spine serialization.
"""

import json
from datetime import date, timedelta
from pathlib import Path

from data_gen.spine.event_spine import AccountSpine
from data_gen.generators.crm_generator import ensure_output_dirs, _account_key


def generate_contracts(spine: AccountSpine, output_dir: Path) -> None:
    """
    Generate DocuSign contracts JSON from an AccountSpine.

    Emits into output_dir/structured/{account_key}/docusign/:
      {account_key}_docusign_contracts.json

    Field notes:
    - renewal_date: end_date + 1 day (the first day of the next contract period)
    - days_to_renewal: computed from date.today() to renewal_date (negative = past)
    - status: "active" if auto_renew=True and end_date >= today, else "expired"
    """
    acct_key = _account_key(spine)
    ensure_output_dirs(output_dir, acct_key, ["docusign"])
    docusign_dir = output_dir / "structured" / acct_key / "docusign"

    today = date.today()
    records = []

    # Map product_scope → a deterministic per-seat list price used only to derive a
    # plausible seat_count from the contract value. This is descriptive demo metadata
    # (NOT a cross-source figure); it never feeds value_usd / amount comparisons.
    _PER_SEAT_USD = {
        "Community": 0,
        "Enterprise": 2_000,
        "ArangoGraph": 2_500,
        "GenAI": 3_000,
    }

    # Sort by signed_date to detect downgrades (tier value drop vs. prior contract).
    _ordered = sorted(spine.contracts, key=lambda c: c.signed_date)
    _prev_value: int | None = None

    for c in _ordered:
        renewal_date = c.end_date + timedelta(days=1)
        days_to_renewal = (renewal_date - today).days
        status = "active" if c.auto_renew and c.end_date >= today else "expired"

        # --- Deepening (DATA-05): grounded, deterministic descriptive fields. ---
        term_days = (c.end_date - c.signed_date).days
        term_months = round(term_days / 30.0)

        per_seat = _PER_SEAT_USD.get(c.product_scope.value, 2_000)
        seat_count = round(c.value_usd / per_seat) if per_seat else 0

        # Billing/payment terms: deterministic by value band (demo realism only).
        if c.value_usd == 0:
            billing_frequency = "none"
            payment_terms = "N/A (free tier)"
        elif c.value_usd >= 150_000:
            billing_frequency = "annual"
            payment_terms = "Net 60"
        else:
            billing_frequency = "annual"
            payment_terms = "Net 30"

        # is_downgrade: this contract's value dropped versus the immediately prior one.
        is_downgrade = _prev_value is not None and c.value_usd < _prev_value
        _prev_value = c.value_usd

        records.append(
            {
                "entity_id": c.entity_id,
                "account_id": c.account_id,
                "signed_date": c.signed_date.isoformat(),
                "end_date": c.end_date.isoformat(),
                "value_usd": c.value_usd,
                "product_scope": c.product_scope.value,
                "auto_renew": c.auto_renew,
                "renewal_date": renewal_date.isoformat(),
                "days_to_renewal": days_to_renewal,
                "status": status,
                # --- deepened descriptive fields (DATA-05) ---
                "term_months": term_months,
                "seat_count": seat_count,
                "billing_frequency": billing_frequency,
                "payment_terms": payment_terms,
                "is_downgrade": is_downgrade,
            }
        )

    (docusign_dir / f"{acct_key}_docusign_contracts.json").write_text(
        json.dumps(records, indent=2, default=str), encoding="utf-8"
    )
