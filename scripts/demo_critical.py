"""
Single source of truth for the demo-critical entity set (closes IN-03).

These are the 12 named entities the locked questions traverse. They are the
hard gate for Phase 4 (D-05): every one of these ids must have a complete,
verifiable bridge (a canonical hub reachable via a structured-side `same_as`
edge whose `canonical_id == id`). An absent / unlinked / mis-linked id is a
FAILURE — never a free pass.

The original 9 cover the 6 Account-A/B (Meridian + Northwind) locked questions.
Phase 9 added Account C (Helio Retail) with 3 new locked questions (Q13 churn
dual-graph, Q14 remediation dual-graph, Q15 structured-only anchor). Those
questions resolve in prose on "Helio Retail" (the org), its departed champion
(Priya Nair), and its at-risk downgrade contract — so all three canonical hubs
must exist in `canonical_entities` for `entityLookup("Helio Retail")` to resolve
instead of the agent correctly refusing. The three Helio ids below are sourced
verbatim from the Plan-01 deterministic spine (`data_gen/spine/spine_helio.py`
+ `entity_registry.py`, the same `canonical_uuid("helio", ...)` / HELIO_ACCOUNT_ID
namespace) — NOT invented here.

This file is the ONLY place the 12-id set may be defined. Both demo-critical
gates (`verify_entity_bridge.py`, `verify_coref_eval.py`) and the builder
fallback (`build_entity_bridge.py`) import from here. Any change to the locked
questions — adding, dropping, or renumbering a demo-critical entity — must
update THIS file and nothing else. Do not re-introduce a duplicate literal id
set anywhere; the static gate greps for it.

The denominator is load-bearing: its value of 12 is what both gates assert
against. The module-level `assert len(DEMO_CRITICAL_IDS) == 12` makes an
accidental edit that changes the count fail at import time.
"""

# ---------------------------------------------------------------------------
# The authoritative 12-entity mapping: entity_id -> {display_name, type, account}
# Source: the original 9 were previously duplicated in verify_entity_bridge.py
# (lines 87-133), verify_coref_eval.py (lines 344-354), and build_entity_bridge.py
# (640-650); the 3 Helio ids come verbatim from the Plan-01 spine
# (data_gen/spine/spine_helio.py + entity_registry.py).
# Consolidated here verbatim — do NOT add, drop, or renumber entries.
# ---------------------------------------------------------------------------

DEMO_CRITICAL_ENTITIES: dict[str, dict] = {
    "633f43bd-5cbd-579e-9105-2ded0f2e7c76": {
        "display_name": "James Okafor",
        "type": "Contact",
        "account": "meridian",
    },
    "135970e6-29ec-5bcb-8cd1-887973aa326d": {
        "display_name": "Taylor Brooks",
        "type": "Contact",
        "account": "meridian",
    },
    "ead03ac6-14ab-5dd9-8bf8-794c507ff628": {
        "display_name": "Patricia Vance",
        "type": "Contact",
        "account": "meridian",
    },
    "4818c0ff-b555-5395-8950-ae3916c176a3": {
        "display_name": "Sarah Chen",
        "type": "Contact",
        "account": "northwind",
    },
    "0b5c0005-9e04-5d41-8cb4-abbe369f0e4f": {
        "display_name": "Michael Torres",
        "type": "Contact",
        "account": "northwind",
    },
    "9eff6d7b-7311-5525-be75-5b82a855ece7": {
        "display_name": "Meridian Logistics",
        "type": "Account",
        "account": "meridian",
    },
    "0d5b5863-d3da-51e3-b117-ddbfa7ba2d16": {
        "display_name": "Northwind Analytics",
        "type": "Account",
        "account": "northwind",
    },
    "47a06e4c-42ce-59ad-865c-cbeef04f1708": {
        "display_name": "Enterprise 2026",
        "type": "Contract",
        "account": "meridian",
    },
    "629062eb-1233-51c3-a74c-6821b2020df3": {
        "display_name": "ArangoGraph 2026",
        "type": "Contract",
        "account": "northwind",
    },
    # -- Account C (Helio Retail) — Phase 9 churn/contraction triad (Q13/Q14/Q15).
    # Ids verbatim from data_gen/spine/spine_helio.py (canonical_uuid("helio", ...)
    # / HELIO_ACCOUNT_ID); they match the loaded structured records exactly. Without
    # the org hub, entityLookup("Helio Retail") finds nothing and the agent refuses.
    "c2de4d08-b3cf-5958-aae8-4ef84ebb81c9": {
        "display_name": "Helio Retail",
        "type": "Account",
        "account": "helio",
    },
    "d4ca7052-80af-5650-803c-00d6aaf9bb6f": {
        "display_name": "Priya Nair",
        "type": "Contact",
        "account": "helio",
    },
    "ee5fd2b7-7511-520d-8814-305a858aa22d": {
        "display_name": "Helio Enterprise Downgrade 2024",
        "type": "Contract",
        "account": "helio",
    },
}

# Preserve insertion order (Python dicts are ordered).
DEMO_CRITICAL_IDS: list[str] = list(DEMO_CRITICAL_ENTITIES.keys())

# Frozenset for membership tests.
DEMO_CRITICAL_ID_SET: frozenset[str] = frozenset(DEMO_CRITICAL_IDS)

# The denominator is load-bearing — guard the count at import time so an
# accidental edit that changes the number of demo-critical entities fails fast.
# 9 (Meridian + Northwind) + 3 (Helio: org + champion + at-risk downgrade) = 12.
assert len(DEMO_CRITICAL_IDS) == 12, (
    f"DEMO_CRITICAL_IDS must contain exactly 12 entities, found {len(DEMO_CRITICAL_IDS)}"
)
assert len(DEMO_CRITICAL_ID_SET) == 12, (
    f"DEMO_CRITICAL_ID_SET must contain exactly 12 unique ids, found {len(DEMO_CRITICAL_ID_SET)}"
)
