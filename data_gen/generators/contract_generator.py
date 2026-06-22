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

    for c in spine.contracts:
        renewal_date = c.end_date + timedelta(days=1)
        days_to_renewal = (renewal_date - today).days
        status = "active" if c.auto_renew and c.end_date >= today else "expired"

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
            }
        )

    (docusign_dir / f"{acct_key}_docusign_contracts.json").write_text(
        json.dumps(records, indent=2, default=str), encoding="utf-8"
    )
