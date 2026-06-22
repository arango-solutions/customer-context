"""
CRM (Salesforce) record generator.

Reads AccountSpine and emits four JSON files per account:
  {account_key}_crm_accounts.json
  {account_key}_crm_contacts.json
  {account_key}_crm_opportunities.json
  {account_key}_crm_nps.json

No LLM calls — pure spine serialization.
All hard facts come directly from the spine (no Faker).
"""

import json
from datetime import date
from pathlib import Path

from data_gen.spine.event_spine import AccountSpine, ArangoEdition


def ensure_output_dirs(output_dir: Path, account_key: str, sources: list[str]) -> None:
    """Create all required subdirectory paths for the given account and sources."""
    for source in sources:
        (output_dir / "structured" / account_key / source).mkdir(parents=True, exist_ok=True)


def _account_key(spine: AccountSpine) -> str:
    """Derive the lowercase account key from the account_name."""
    return spine.account_name.lower().split()[0]  # "Northwind Analytics" → "northwind"


def generate_crm(spine: AccountSpine, output_dir: Path) -> None:
    """
    Generate CRM JSON files from an AccountSpine.

    Emits into output_dir/structured/{account_key}/crm/:
      - {account_key}_crm_accounts.json
      - {account_key}_crm_contacts.json
      - {account_key}_crm_opportunities.json
      - {account_key}_crm_nps.json
    """
    acct_key = _account_key(spine)
    ensure_output_dirs(output_dir, acct_key, ["crm"])
    crm_dir = output_dir / "structured" / acct_key / "crm"

    # ------------------------------------------------------------------ #
    # accounts.json — one record per account                              #
    # ------------------------------------------------------------------ #
    nps_scores = [n.score for n in spine.nps]
    health_score = round(sum(nps_scores) / len(nps_scores), 2) if nps_scores else None

    all_dates = [e.event_date for e in spine.docs] + [c.signed_date for c in spine.contracts]
    last_activity_date = max(all_dates).isoformat() if all_dates else None

    products_contracted = list(
        dict.fromkeys(c.product_scope.value for c in spine.contracts)
    )

    deployment_date = (
        min(c.signed_date for c in spine.contracts).isoformat()
        if spine.contracts
        else None
    )

    # --- Deepening (DATA-05): additional GROUNDED, deterministic descriptive
    # fields derived purely from the spine. None of these alias a field the
    # cross-source / range linters key on (value_usd, amount_usd, nps_score,
    # csat, products_contracted), so they are descriptive-only and the loader
    # passes them through unchanged. ---

    # Industry/vertical and region: deterministic mapping by account_key.
    _INDUSTRY_BY_KEY = {
        "northwind": "Data Analytics & Business Intelligence",
        "meridian": "Logistics & Supply Chain",
        "helio": "E-commerce & Retail Personalization",
    }
    _REGION_BY_KEY = {
        "northwind": "North America",
        "meridian": "EMEA",
        "helio": "North America",
    }

    # Current product tier = the most recently signed contract's product_scope.
    _latest_contract = (
        max(spine.contracts, key=lambda c: c.signed_date) if spine.contracts else None
    )
    current_tier = _latest_contract.product_scope.value if _latest_contract else None

    # Current annual contract value (the active/most-recent contract) — exposed
    # under a deliberately distinct key (NOT value_usd) so cross-source value
    # matching, which keys on value_usd/amount_usd, is unaffected.
    current_acv_usd = _latest_contract.value_usd if _latest_contract else None

    # CSM owner: the active champion contact if one exists, else a default CSM.
    _active_champion = next(
        (c for c in spine.contacts if c.role == "champion" and c.active_to is None),
        None,
    )
    csm_owner = "Alex Rivera"  # demo CSM (matches the generators' _DEFAULT_CSM)

    # Health-score detail: a qualitative band derived from the numeric health_score.
    if health_score is None:
        health_band = "unknown"
    elif health_score >= 8:
        health_band = "healthy"
    elif health_score >= 5:
        health_band = "watch"
    else:
        health_band = "at-risk"

    # Trajectory: derived from the usage series direction (first vs. last reading).
    if len(spine.usage) >= 2:
        _first_q, _last_q = spine.usage[0].query_volume_m, spine.usage[-1].query_volume_m
        if _last_q > _first_q * 1.05:
            trajectory = "expanding"
        elif _last_q < _first_q * 0.95:
            trajectory = "contracting"
        else:
            trajectory = "stable"
    else:
        trajectory = "stable"

    accounts_records = [
        {
            "entity_id": spine.account_id,
            "account_id": spine.account_id,
            "account_name": spine.account_name,
            "segment": "Enterprise",
            "health_score": health_score,
            "last_activity_date": last_activity_date,
            "products_contracted": products_contracted,
            "deployment_date": deployment_date,
            # --- deepened descriptive fields (DATA-05) ---
            "industry": _INDUSTRY_BY_KEY.get(acct_key, "Technology"),
            "region": _REGION_BY_KEY.get(acct_key, "North America"),
            "csm_owner": csm_owner,
            "current_product_tier": current_tier,
            "current_acv_usd": current_acv_usd,
            "health_band": health_band,
            "account_trajectory": trajectory,
            "primary_champion": _active_champion.full_name if _active_champion else None,
        }
    ]
    (crm_dir / f"{acct_key}_crm_accounts.json").write_text(
        json.dumps(accounts_records, indent=2, default=str), encoding="utf-8"
    )

    # ------------------------------------------------------------------ #
    # contacts.json                                                        #
    # ------------------------------------------------------------------ #
    contacts_records = [
        {
            "entity_id": c.entity_id,
            "account_id": c.account_id,
            "full_name": c.full_name,
            "title": c.title,
            "role": c.role,
            "email": c.email,
            "active_from": c.active_from.isoformat(),
            "active_to": c.active_to.isoformat() if c.active_to else None,
            # --- deepened descriptive fields (DATA-05) ---
            # engagement_status: derived from active_to (None = still engaged).
            "engagement_status": "active" if c.active_to is None else "disengaged",
            # influence: champions/economic buyers are decision-relevant; users are not.
            "influence": (
                "decision-maker"
                if c.role in ("champion", "economic_buyer")
                else "user"
            ),
            # is_primary: the champion is the primary relationship owner.
            "is_primary": c.role == "champion",
        }
        for c in spine.contacts
    ]
    (crm_dir / f"{acct_key}_crm_contacts.json").write_text(
        json.dumps(contacts_records, indent=2, default=str), encoding="utf-8"
    )

    # ------------------------------------------------------------------ #
    # opportunities.json                                                   #
    # ------------------------------------------------------------------ #
    def _forecast_category(stage: str) -> str:
        """Map a CRM stage to a forecast category (deterministic)."""
        if stage == "closed-won":
            return "Closed"
        if stage == "closed-lost":
            return "Omitted"
        if stage == "negotiation":
            return "Commit"
        if stage == "proposal":
            return "Best Case"
        return "Pipeline"

    def _stage_detail(o) -> str:
        """Grounded one-line stage narrative derived from type + stage."""
        if o.stage == "closed-won":
            return f"{o.opportunity_type.capitalize()} closed-won for {o.product_scope.value}"
        if o.stage == "closed-lost":
            return (
                f"{o.opportunity_type.capitalize()} did not close — "
                f"{o.product_scope.value} scope was declined"
            )
        if o.stage in ("negotiation", "proposal"):
            return (
                f"{o.opportunity_type.capitalize()} for {o.product_scope.value} "
                f"in active {o.stage}; outcome pending"
            )
        return f"{o.opportunity_type.capitalize()} opportunity for {o.product_scope.value}"

    opportunities_records = [
        {
            "entity_id": o.entity_id,
            "account_id": o.account_id,
            "stage": o.stage,
            "close_date": o.close_date.isoformat(),
            "amount_usd": o.amount_usd,
            "opportunity_type": o.opportunity_type,
            "product_scope": o.product_scope.value,
            # Cross-source linkage: points to the DocuSign contract generated by this
            # opportunity (None for proposals/lost deals where no contract has been signed).
            "contract_entity_id": o.contract_entity_id,
            # When the linked contract expires (= DocuSign end_date); used by the
            # cross-source renewal-date linter check.
            "renewal_date": o.renewal_date.isoformat() if o.renewal_date else None,
            # --- deepened descriptive fields (DATA-05) ---
            # is_won/is_open: derived booleans for quick filtering in the UI.
            "is_won": o.stage == "closed-won",
            "is_open": o.stage in ("negotiation", "proposal"),
            "forecast_category": _forecast_category(o.stage),
            "stage_detail": _stage_detail(o),
        }
        for o in spine.opportunities
    ]
    (crm_dir / f"{acct_key}_crm_opportunities.json").write_text(
        json.dumps(opportunities_records, indent=2, default=str), encoding="utf-8"
    )

    # ------------------------------------------------------------------ #
    # nps.json                                                             #
    # ------------------------------------------------------------------ #
    def _score_band(score: int) -> str:
        """NPS 0-10 → promoter/passive/detractor band (standard NPS bands)."""
        if score >= 9:
            return "promoter"
        if score >= 7:
            return "passive"
        return "detractor"

    nps_records = [
        {
            "entity_id": n.entity_id,
            "account_id": n.account_id,
            "score": n.score,
            "nps_score": n.score,  # alias for linter compatibility
            "verbatim_sentiment": n.verbatim_sentiment,
            "survey_date": n.survey_date.isoformat(),
            "survey_period": n.survey_period,
            # --- deepened descriptive fields (DATA-05) ---
            "score_band": _score_band(n.score),
            # sentiment_aligned: False marks the Q12-style contradiction where a
            # green/acceptable score sits next to a negative verbatim comment.
            "sentiment_aligned": not (
                _score_band(n.score) in ("promoter", "passive")
                and n.verbatim_sentiment == "negative"
            ),
            "survey_year": n.survey_date.year,
        }
        for n in spine.nps
    ]
    (crm_dir / f"{acct_key}_crm_nps.json").write_text(
        json.dumps(nps_records, indent=2, default=str), encoding="utf-8"
    )
