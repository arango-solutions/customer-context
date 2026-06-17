"""
Answerability checks — 6-question record presence.

For each of the 6 locked demo questions, asserts that the required records
are present in the generated dataset. If any required record is missing,
the agent cannot produce a correct, fully-sourced answer for that question.

Questions:
  Q7  — Product-ladder adoption + ROI (structured-only anchor; Account A = Northwind)
  Q2  — Renewal risk + WHY (dual; Account B = Meridian, contrast Account A)
  Q12 — Usage green / sentiment red (dual centerpiece; Account B = Meridian)
  Q9  — Champion engagement (dual; Account B = Meridian)
  Q5  — ArangoGraph / GenAI readiness (dual; Account A = Northwind)
  Q8  — Promise vs. delivery (dual; Account B = Meridian)
"""

import pytest


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _signal_docs_for(manifest: dict, question_id: str, modules: list[str]) -> list[str]:
    """Return file_names that are signal docs for the given question_id within the given modules."""
    return [
        file_name
        for file_name, meta in manifest.items()
        if meta.get("role") == "signal"
        and question_id in (meta.get("questions_served") or [])
        and meta.get("module") in modules
    ]


def _near_miss_docs_for(manifest: dict, question_id: str) -> list[str]:
    """Return file_names that are near-miss docs for the given question_id."""
    return [
        file_name
        for file_name, meta in manifest.items()
        if meta.get("role") == "near-miss"
        and question_id in (meta.get("questions_served") or [])
    ]


def _has_records(structured: dict, account: str, source_keyword: str) -> bool:
    """True if the structured output has at least one record for the given account and source."""
    bucket = structured.get(account, {})
    for source, records in bucket.items():
        if source_keyword.lower() in source.lower() and records:
            return True
    return False


# ---------------------------------------------------------------------------
# Q7 — Structured-only anchor (Account A = Northwind)
# ---------------------------------------------------------------------------


def test_q7_structured_records_present(load_structured):
    """
    Q7 is structured-only: assert UsageMetric, Contract, and Opportunity
    records exist for Northwind (Account A).

    Without these records the product-ladder adoption and ROI story cannot
    be sourced from structured data alone.
    """
    missing = []

    if not _has_records(load_structured, "northwind", "usage"):
        missing.append("northwind UsageMetric records (source containing 'usage')")
    if not _has_records(load_structured, "northwind", "contract"):
        missing.append("northwind Contract records (source containing 'contract')")
    if not _has_records(load_structured, "northwind", "opportunit"):
        missing.append("northwind Opportunity records (source containing 'opportunit')")

    assert not missing, (
        "Q7 is unanswerable — missing structured records:\n"
        + "\n".join(f"  - {m}" for m in missing)
    )


# ---------------------------------------------------------------------------
# Q2 — Renewal risk + WHY (Account B = Meridian)
# ---------------------------------------------------------------------------


def test_q2_signal_docs_present(load_manifest):
    """
    Q2 requires at least 1 signal document with "Q2" in questions_served
    from Meridian's modules (any of: slack, email, docs, pdf).

    The WHY of the renewal risk lives only in the unstructured graph.
    """
    meridian_modules = ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"]
    signal_docs = _signal_docs_for(load_manifest, "Q2", meridian_modules)

    assert len(signal_docs) >= 1, (
        f"Q2 requires at least 1 signal doc in meridian modules — "
        f"found {len(signal_docs)}: {signal_docs}"
    )


# ---------------------------------------------------------------------------
# Q12 — Usage green / sentiment red centerpiece (Account B = Meridian)
# ---------------------------------------------------------------------------


def test_q12_signal_docs_present(load_manifest):
    """
    Q12 requires at least 1 signal doc with "Q12" in questions_served for
    EACH of the 4 Meridian modules: slack, email, docs, pdf.

    Q12 is the demo centerpiece — all 4 signal-doc types must be present
    to demonstrate the full cross-graph contradiction story.
    """
    required_modules = ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"]
    missing_modules = []

    for module in required_modules:
        docs = _signal_docs_for(load_manifest, "Q12", [module])
        if not docs:
            missing_modules.append(module)

    assert not missing_modules, (
        f"Q12 centerpiece is incomplete — missing signal docs for modules: "
        f"{missing_modules}"
    )


# ---------------------------------------------------------------------------
# Q9 — Champion engagement (Account B = Meridian)
# ---------------------------------------------------------------------------


def test_q9_signal_docs_present(load_manifest):
    """
    Q9 requires at least 1 signal doc with "Q9" in questions_served for
    meridian_email and meridian_docs.

    Champion disengagement is evidenced by email thread frequency drop
    (email) and QBR attendance (docs/meeting-notes).
    """
    required_modules = ["meridian_email", "meridian_docs"]
    missing_modules = []

    for module in required_modules:
        docs = _signal_docs_for(load_manifest, "Q9", [module])
        if not docs:
            missing_modules.append(module)

    assert not missing_modules, (
        f"Q9 is incomplete — missing signal docs for modules: {missing_modules}"
    )


# ---------------------------------------------------------------------------
# Q5 — ArangoGraph / GenAI readiness (Account A = Northwind)
# ---------------------------------------------------------------------------


def test_q5_signal_docs_present(load_manifest):
    """
    Q5 requires at least 1 signal doc with "Q5" in questions_served for
    northwind_slack and northwind_docs.

    The documented trigger (scale pain, ops burden, GenAI intent) lives in
    Slack CSM notes and success-plan docs.
    """
    required_modules = ["northwind_slack", "northwind_docs"]
    missing_modules = []

    for module in required_modules:
        docs = _signal_docs_for(load_manifest, "Q5", [module])
        if not docs:
            missing_modules.append(module)

    assert not missing_modules, (
        f"Q5 is incomplete — missing signal docs for modules: {missing_modules}"
    )


# ---------------------------------------------------------------------------
# Q8 — Promise vs. delivery (Account B = Meridian)
# ---------------------------------------------------------------------------


def test_q8_signal_docs_present(load_manifest):
    """
    Q8 requires at least 1 signal doc with "Q8" in questions_served from
    any northwind or meridian email/docs/slack module.

    The unlogged promise exists only in unstructured channels; at least one
    signal doc must capture it.
    """
    all_modules = [
        "northwind_slack", "northwind_email", "northwind_docs",
        "meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf",
    ]
    signal_docs = _signal_docs_for(load_manifest, "Q8", all_modules)

    assert len(signal_docs) >= 1, (
        f"Q8 is unanswerable — no signal docs found for Q8 in any module "
        f"(searched: {all_modules})"
    )


# ---------------------------------------------------------------------------
# Both accounts present
# ---------------------------------------------------------------------------


def test_both_accounts_have_structured_data(load_structured):
    """
    Both 'northwind' and 'meridian' must appear in the structured output dict.

    If one account is missing entirely, the demo cannot show the Northwind
    (healthy) vs Meridian (at-risk) contrast that drives questions Q2, Q7, Q12.
    """
    missing = []
    for account in ("northwind", "meridian"):
        if account not in load_structured or not load_structured[account]:
            missing.append(account)

    assert not missing, (
        f"Missing accounts in structured output: {missing}"
    )


# ---------------------------------------------------------------------------
# Near-miss docs required for precision test
# ---------------------------------------------------------------------------


def test_near_miss_docs_present_per_question(load_manifest):
    """
    For each of Q12, Q2, Q9, Q8 assert at least 2 near-miss docs exist.

    The near-miss guard (D-08) only has meaning if near-miss distractors are
    actually present. Without them the guard trivially passes and provides
    no signal about retrieval precision.
    """
    required_questions = ["Q12", "Q2", "Q9", "Q8"]
    insufficient = []

    for q_id in required_questions:
        docs = _near_miss_docs_for(load_manifest, q_id)
        if len(docs) < 2:
            insufficient.append(
                f"{q_id}: found {len(docs)} near-miss doc(s), need >= 2"
            )

    assert not insufficient, (
        "Insufficient near-miss docs for near-miss guard:\n"
        + "\n".join(f"  - {m}" for m in insufficient)
    )


# ---------------------------------------------------------------------------
# Composite: both graph halves present for each dual-graph question
# ---------------------------------------------------------------------------


def test_all_six_questions_have_both_graph_halves(load_manifest, load_structured):
    """
    Composite check: for each dual-graph question (Q2, Q12, Q9, Q5, Q8), assert:
      - At least 1 signal doc exists in the manifest (unstructured graph side)
      - The required structured records exist (CRM/Snowflake/DocuSign)

    Q7 is structured-only and skips the unstructured side check.

    This is the 'both sides are present' gate — if either half is missing,
    the agent cannot produce a fully-sourced, traceable answer.
    """
    failures = []

    # Dual-graph questions with their required structured sources and accounts
    dual_graph = {
        "Q2": {
            "account": "meridian",
            "required_structured": ["crm", "contract"],
            "modules": ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"],
        },
        "Q12": {
            "account": "meridian",
            "required_structured": ["usage", "crm"],
            "modules": ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"],
        },
        "Q9": {
            "account": "meridian",
            "required_structured": ["crm"],
            "modules": ["meridian_email", "meridian_docs", "meridian_slack"],
        },
        "Q5": {
            "account": "northwind",
            "required_structured": ["usage", "contract"],
            "modules": ["northwind_slack", "northwind_docs", "northwind_email"],
        },
        "Q8": {
            "account": "meridian",
            "required_structured": ["crm", "contract"],
            "modules": [
                "northwind_slack", "northwind_email", "northwind_docs",
                "meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf",
            ],
        },
    }

    for q_id, spec in dual_graph.items():
        # Unstructured side: at least 1 signal doc
        signal_docs = _signal_docs_for(load_manifest, q_id, spec["modules"])
        if not signal_docs:
            failures.append(
                f"{q_id}: no signal docs in manifest for modules {spec['modules']}"
            )

        # Structured side: required sources present for the account
        for source_kw in spec["required_structured"]:
            if not _has_records(load_structured, spec["account"], source_kw):
                failures.append(
                    f"{q_id}: missing structured records for "
                    f"account={spec['account']} source_keyword={source_kw!r}"
                )

    # Q7 — structured-only (no unstructured assertion)
    for source_kw in ("usage", "contract", "opportunit"):
        if not _has_records(load_structured, "northwind", source_kw):
            failures.append(
                f"Q7: missing structured records for northwind source_keyword={source_kw!r}"
            )

    assert not failures, (
        "Both-graph-halves check failed — the following are missing:\n"
        + "\n".join(f"  - {f}" for f in failures)
    )
