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

    # Peak volume across the whole series (for the is_peak flag) — deterministic.
    peak_volume = max((u.query_volume_m for u in spine.usage), default=None)

    records = []
    previous_volume: Optional[float] = None

    for u in spine.usage:
        if previous_volume is None:
            growth_pct = None
        else:
            growth_pct = round((u.query_volume_m - previous_volume) / previous_volume * 100, 1)

        # --- Deepening (DATA-05): grounded, deterministic descriptive fields
        # derived from the existing series. No randomness, no new spine facts. ---

        # Quarter-over-quarter trend label derived from growth_pct.
        if growth_pct is None:
            volume_trend = "baseline"
        elif growth_pct > 2:
            volume_trend = "rising"
        elif growth_pct < -2:
            volume_trend = "falling"
        else:
            volume_trend = "flat"

        # Queries-per-node intensity (rounded) — a derived utilization proxy.
        queries_per_node_m = (
            round(u.query_volume_m / u.cluster_nodes, 2) if u.cluster_nodes else None
        )

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
                # --- deepened descriptive fields (DATA-05) ---
                "volume_trend": volume_trend,
                "queries_per_node_m": queries_per_node_m,
                "is_peak_period": (
                    peak_volume is not None and u.query_volume_m == peak_volume
                ),
            }
        )
        previous_volume = u.query_volume_m

    (snowflake_dir / f"{acct_key}_snowflake_usage_metrics.json").write_text(
        json.dumps(records, indent=2, default=str), encoding="utf-8"
    )
