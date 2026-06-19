"""
Snowflake usage metric generator.

Reads AccountSpine and emits one JSON file per account:
  {account_key}_snowflake_usage_metrics.json

Includes a computed query_volume_growth_pct field: the quarter-over-quarter
growth rate expressed as a percentage (null for the first record in the series).

No LLM calls — pure spine serialization.
"""

import json
from pathlib import Path
from typing import Optional

from data_gen.spine.event_spine import AccountSpine
from data_gen.generators.crm_generator import ensure_output_dirs, _account_key


def generate_usage(spine: AccountSpine, output_dir: Path) -> None:
    """
    Generate Snowflake usage metrics JSON from an AccountSpine.

    Emits into output_dir/structured/{account_key}/snowflake/:
      {account_key}_snowflake_usage_metrics.json
    """
    acct_key = _account_key(spine)
    ensure_output_dirs(output_dir, acct_key, ["snowflake"])
    snowflake_dir = output_dir / "structured" / acct_key / "snowflake"

    records = []
    previous_volume: Optional[float] = None

    for u in spine.usage:
        if previous_volume is None:
            growth_pct = None
        else:
            growth_pct = round((u.query_volume_m - previous_volume) / previous_volume * 100, 1)

        records.append(
            {
                "entity_id": u.entity_id,
                "account_id": u.account_id,
                "period": u.period,
                "query_volume_m": u.query_volume_m,
                "cluster_nodes": u.cluster_nodes,
                "edition": u.edition.value,
                "smartgraphs_enabled": u.smartgraphs_enabled,
                "graphrag_enabled": u.graphrag_enabled,
                "query_volume_growth_pct": growth_pct,
            }
        )
        previous_volume = u.query_volume_m

    (snowflake_dir / f"{acct_key}_snowflake_usage_metrics.json").write_text(
        json.dumps(records, indent=2, default=str), encoding="utf-8"
    )
