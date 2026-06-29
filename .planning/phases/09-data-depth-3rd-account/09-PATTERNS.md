# Phase 9: Data Depth & 3rd Account - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 9 new/modified files (Wave 0 gaps) + 8 generator files (DATA-05 deepening)
**Analogs found:** 9 / 9 with at least one strong match

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data_gen/spine/spine_helio.py` (NEW) | data model | CRUD / batch | `data_gen/spine/spine_meridian.py` | exact |
| `data_gen/spine/entity_registry.py` | config / constants | — | self (additive) | exact |
| `data_gen/generate.py` | orchestrator | batch | self (additive) | exact |
| `data_gen/linter/conftest.py` | test config / fixtures | — | self (additive) | exact |
| `data_gen/linter/test_answerability.py` | test / linter | — | self (additive) | exact |
| `data_gen/linter/test_near_miss_guard.py` | test / empirical guard | event-driven | self (additive) | exact |
| `agent/test/questions.eval.test.ts` | test / integration eval | request-response | self (additive) | exact |
| `scripts/eval-gate.ts` | utility / gate | batch | self (additive) | exact |
| `agent/src/index.ts` | service / export | request-response | self (additive, optional) | exact |
| `data_gen/generators/{crm,usage,contract,slack,email,docs,pdf}_generator.py` (MODIFY) | generator | batch / transform | self (DATA-05 deepening) | exact |

---

## Pattern Assignments

### `data_gen/spine/spine_helio.py` (NEW — Account C spine)

**Analog:** `data_gen/spine/spine_meridian.py`

**Imports pattern** (`spine_meridian.py` lines 14-33):
```python
from datetime import date

from data_gen.spine.entity_registry import (
    MERIDIAN_ACCOUNT_ID,
    NORTHWIND_ACCOUNT_ID,    # only needed for cross-account near-miss docs
    GLOBAL_SEED,             # noqa: F401 — available for generators
    canonical_uuid,
    make_citable_url,
    make_file_name,
)
from data_gen.spine.event_spine import (
    AccountSpine,
    ArangoEdition,
    ContactEvent,
    ContractEvent,
    DocEvent,
    NpsEvent,
    OpportunityEvent,
    UsageEvent,
)
```
For Helio: replace `MERIDIAN_ACCOUNT_ID` with `HELIO_ACCOUNT_ID`; drop `NORTHWIND_ACCOUNT_ID` unless a cross-account near-miss doc references it.

**AccountSpine construction pattern** (`spine_meridian.py` lines 716-725):
```python
MERIDIAN_SPINE: AccountSpine = AccountSpine(
    account_id=MERIDIAN_ACCOUNT_ID,
    account_name="Meridian Logistics",
    contracts=_contracts,
    usage=_usage_records,
    contacts=_contacts,
    opportunities=_opportunities,
    nps=_nps_records,
    docs=_signal_docs + _near_miss_docs + _noise_docs,
)
```
For Helio: `account_name="Helio Retail"` — the first token `"Helio"` → `account_key = "helio"` (verified: `generate.py:74,111` uses `spine.account_name.lower().split()[0]`). Never use a two-word or hyphenated first token.

**`_usage` helper + declining series pattern** (mirror of `spine_meridian.py` lines 103-140, but with a FALLING curve per D-01/D-03):
```python
def _usage(
    period: str,
    qvol: float,
    nodes: int,
) -> UsageEvent:
    return UsageEvent(
        event_id=f"he_usage_{period.lower().replace('-', '_')}",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"usage:{period}"),
        period=period,
        query_volume_m=round(qvol, 2),
        cluster_nodes=nodes,
        edition=ArangoEdition.Enterprise,   # starts Enterprise; downgrade event later
        smartgraphs_enabled=True,
        graphrag_enabled=False,
    )

_usage_records: list[UsageEvent] = [
    # Rise to peak
    _usage("2022-Q1", 6.00, 6),
    _usage("2022-Q2", 7.20, 6),
    _usage("2022-Q3", 9.00, 8),
    _usage("2022-Q4", 11.00, 8),
    _usage("2023-Q1", 12.00, 10),  # peak
    # Decline (the structural churn signature — D-03 — distinct from Meridian's monotonic rise)
    _usage("2023-Q2", 9.50, 10),
    _usage("2023-Q3", 8.00, 8),
    _usage("2024-Q1", 6.00, 6),
    _usage("2024-Q2", 4.50, 6),    # trough
]
```
Meridian `_usage_records` is monotonically rising (lines 121-140). Helio MUST be rising-then-falling so the near-miss guard keeps the two accounts lexically distinct.

**Downgrade `ContractEvent` pattern** (no analog in Meridian; contrast with `spine_meridian.py` flat contracts lines 39-92):
```python
# Downgrade contract — ArangoGraph → Enterprise (or Enterprise → Community)
# with lower value_usd and auto_renew=False — the structural contraction signature
ContractEvent(
    event_id="he_contract_downgrade_2024",
    account_id=HELIO_ACCOUNT_ID,
    entity_id=canonical_uuid("helio", "contract:downgrade_2024"),
    signed_date=date(2024, 3, 1),
    end_date=date(2025, 2, 28),
    value_usd=95_000,          # lower than the prior contract value
    product_scope=ArangoEdition.Enterprise,
    auto_renew=False,          # renewal at risk
)
```

**`_nps` helper + declining score/sentiment pattern** (mirror of `spine_meridian.py` lines 274-311, but both score AND sentiment decline together — the D-03 distinction from Q12):
```python
def _nps(period, score, sentiment, survey_date):
    return NpsEvent(
        event_id=f"he_nps_{period.lower().replace('-', '_')}",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"nps:{period}"),
        score=score,
        verbatim_sentiment=sentiment,
        survey_date=survey_date,
        survey_period=period,
    )

_nps_records: list[NpsEvent] = [
    _nps("2022-Q1", 8, "positive", date(2022, 3, 31)),
    _nps("2022-Q4", 7, "positive", date(2022, 12, 31)),
    _nps("2023-Q2", 6, "neutral",  date(2023, 6, 30)),  # score AND sentiment both fall
    _nps("2024-Q1", 4, "negative", date(2024, 3, 31)),  # the key D-03 distinction:
    _nps("2024-Q2", 3, "negative", date(2024, 6, 30)),  # no contradiction — both are bad
]
```
Meridian (Q12) has score=7-8 (green) + sentiment=negative (red) → contradiction. Helio MUST have both score and sentiment falling together so Q13 is NOT mistaken for Q12.

**`_noise_doc` helper pattern** (`spine_meridian.py` lines 641-662):
```python
def _noise_doc(
    module: str,
    slug: str,
    event_date: date,
    ext: str = "txt",
) -> DocEvent:
    account_key = "helio"
    source = module.split("_", 1)[1]  # e.g. "helio_slack" → "slack"
    event_id = f"he_{source}_{slug}"
    return DocEvent(
        event_id=event_id,
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"doc:{event_id}"),
        module=module,
        file_name=make_file_name(module, event_id, ext),
        citable_url=make_citable_url(account_key, source, event_id),
        event_date=event_date,
        role="noise",
        questions_served=[],
        spine_events=[],
    )
```

**Signal DocEvent pattern** (`spine_meridian.py` lines 319-384 for Q12 signals):
```python
DocEvent(
    event_id="he_slack_contraction_2024q1",
    account_id=HELIO_ACCOUNT_ID,
    entity_id=canonical_uuid("helio", "doc:he_slack_contraction_2024q1"),
    module="helio_slack",
    file_name=make_file_name("helio_slack", "he_slack_contraction_2024q1", "txt"),
    citable_url=make_citable_url("helio", "slack", "he_slack_contraction_2024q1"),
    event_date=date(2024, 1, 20),
    role="signal",
    questions_served=["Q13"],          # C's flagship dual-graph question
    spine_events=["he_usage_2024_q1", "he_contract_downgrade_2024"],
)
```
Vocabulary for signal docs MUST center on: `contraction`, `downgrade`, `migration-away`, `declining-usage`, `deprioritization` — lexically distinct from Meridian's `renewal-pricing-objection` / `champion-quiet` (D-03 anti-collision requirement).

**`_signal_docs` assembly pattern** (`spine_meridian.py` line 521):
```python
_signal_docs: list[DocEvent] = _signal_q13 + _signal_q14 + _signal_q15
_near_miss_docs: list[DocEvent] = [...]  # same-vocabulary-positive-outcome docs
_noise_docs: list[DocEvent] = [...]      # routine ops, no signal terms

HELIO_SPINE: AccountSpine = AccountSpine(
    account_id=HELIO_ACCOUNT_ID,
    account_name="Helio Retail",
    contracts=_contracts,
    usage=_usage_records,
    contacts=_contacts,
    opportunities=_opportunities,
    nps=_nps_records,
    docs=_signal_docs + _near_miss_docs + _noise_docs,
)
```

---

### `data_gen/spine/entity_registry.py` (MODIFY — add HELIO_ACCOUNT_ID + 4 helio_* modules)

**Existing `ACCOUNT_ID` declaration pattern** (`entity_registry.py` lines 53-54):
```python
NORTHWIND_ACCOUNT_ID: str = canonical_uuid("northwind", "northwind_analytics")
MERIDIAN_ACCOUNT_ID: str = canonical_uuid("meridian", "meridian_logistics")
```
Add after line 54:
```python
HELIO_ACCOUNT_ID: str = canonical_uuid("helio", "helio_retail")
```

**Existing `MODULE_NAMES` list** (`entity_registry.py` lines 60-69 — the ONE-WAY DOOR):
```python
MODULE_NAMES: list[str] = [
    "northwind_slack",
    "northwind_email",
    "northwind_docs",
    "northwind_pdf",
    "meridian_slack",
    "meridian_email",
    "meridian_docs",
    "meridian_pdf",
]
```
Extend to 12 — append after `"meridian_pdf"`:
```python
    "helio_slack",
    "helio_email",
    "helio_docs",
    "helio_pdf",
```
This is the **one-way door**: `test_field_stamps.py::test_module_names_valid` asserts every manifest module ∈ MODULE_NAMES. Updating only `entity_registry.py` without also updating `conftest.py` will leave that test broken.

---

### `data_gen/generate.py` (MODIFY — import + append HELIO_SPINE)

**Existing spine import block** (`generate.py` lines 42-43):
```python
from data_gen.spine.spine_northwind import NORTHWIND_SPINE
from data_gen.spine.spine_meridian import MERIDIAN_SPINE
```
Add after line 43:
```python
from data_gen.spine.spine_helio import HELIO_SPINE
```

**Existing `_SPINES` list** (`generate.py` line 62):
```python
_SPINES = [NORTHWIND_SPINE, MERIDIAN_SPINE]
```
Change to:
```python
_SPINES = [NORTHWIND_SPINE, MERIDIAN_SPINE, HELIO_SPINE]
```

**No other edits required.** The structured generator loop (`generate.py` lines 110-117) and the four unstructured generator calls (lines 123-133) all iterate `_SPINES` generically. The `account_key` derivation (`generate.py:74,111`) is `spine.account_name.lower().split()[0]` → produces `"helio"` automatically.

**`account_key` derivation pattern** (`generate.py` lines 73-76):
```python
for spine in _SPINES:
    account_key = spine.account_name.lower().split()[0]
    for source in ("crm", "snowflake", "docusign"):
        (_OUTPUT_DIR / "structured" / account_key / source).mkdir(parents=True, exist_ok=True)
```

---

### `data_gen/linter/conftest.py` (MODIFY — widen duplicated MODULE_NAMES + QUESTION_IDS)

**Existing `MODULE_NAMES` in conftest** (`conftest.py` lines 16-25 — DUPLICATED from entity_registry, NOT imported):
```python
MODULE_NAMES = [
    "northwind_slack",
    "northwind_email",
    "northwind_docs",
    "northwind_pdf",
    "meridian_slack",
    "meridian_email",
    "meridian_docs",
    "meridian_pdf",
]
```
Must be widened to 12 in sync with `entity_registry.py`. Append the 4 `helio_*` entries.

**Existing `QUESTION_IDS`** (`conftest.py` line 27):
```python
QUESTION_IDS = ["Q7", "Q2", "Q12", "Q9", "Q5", "Q8"]
```
Add C's question IDs (e.g. `"Q13"`, `"Q14"`, `"Q15"`):
```python
QUESTION_IDS = ["Q7", "Q2", "Q12", "Q9", "Q5", "Q8", "Q13", "Q14", "Q15"]
```

---

### `data_gen/linter/test_answerability.py` (MODIFY — add C question test functions)

**Per-question test function pattern** (`test_answerability.py` lines 60-80 — Q7 structured-only anchor):
```python
def test_q7_structured_records_present(load_structured):
    """
    Q7 is structured-only: assert UsageMetric, Contract, and Opportunity
    records exist for Northwind (Account A).
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
```
Copy this pattern for C's structured-only anchor (Q15 or equivalent), replacing `"northwind"` with `"helio"` and updating the docstring.

**Dual-graph signal doc test pattern** (`test_answerability.py` lines 88-101 — Q2):
```python
def test_q2_signal_docs_present(load_manifest):
    """
    Q2 requires at least 1 signal document with "Q2" in questions_served
    from Meridian's modules (any of: slack, email, docs, pdf).
    """
    meridian_modules = ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"]
    signal_docs = _signal_docs_for(load_manifest, "Q2", meridian_modules)

    assert len(signal_docs) >= 1, (
        f"Q2 requires at least 1 signal doc in meridian modules — "
        f"found {len(signal_docs)}: {signal_docs}"
    )
```
Copy for Q13 (C's flagship dual-graph), replacing `"Q2"` with `"Q13"`, the module list with `helio_*` modules, and the docstring.

**Per-module coverage pattern** (`test_answerability.py` lines 108-128 — Q12 requiring all 4 modules):
```python
def test_q12_signal_docs_present(load_manifest):
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
```
Copy for Q13 if it requires signal docs in all 4 helio modules; use the simpler `>= 1` form if coverage requirements are looser.

**Helper functions** (already in the file — reusable as-is, `test_answerability.py` lines 25-52):
```python
def _signal_docs_for(manifest: dict, question_id: str, modules: list[str]) -> list[str]: ...
def _near_miss_docs_for(manifest: dict, question_id: str) -> list[str]: ...
def _has_records(structured: dict, account: str, source_keyword: str) -> bool: ...
```
No changes needed to helpers.

**`test_both_accounts_have_structured_data`** (`test_answerability.py` lines 212-227) checks `("northwind", "meridian")`. Rename to `test_all_accounts_have_structured_data` and extend the tuple to include `"helio"`.

---

### `data_gen/linter/test_near_miss_guard.py` (MODIFY — add Q13 QUESTION_TEXTS + test function)

**`QUESTION_TEXTS` dict** (`test_near_miss_guard.py` lines 55-80 — the existing 5 entries):
```python
QUESTION_TEXTS = {
    "Q12": (
        "Meridian Logistics usage metrics show consistent growth yet customer sentiment "
        "is negative — what is the contradiction between healthy product adoption and "
        "operational concerns raised in recent reviews?"
    ),
    "Q2": (
        "Meridian Logistics contract renewal is at risk in 2025 — what are the service "
        "concerns and pricing objections raised by the executive team that are blocking "
        "the renewal negotiation?"
    ),
    ...
}
```
Add C's dual-graph question entry using vocabulary present in Helio's signal docs (contraction / downgrade / migration-away — distinct from Meridian's renewal-pricing / champion-quiet):
```python
    "Q13": (
        "Helio Retail usage is declining and they downgraded their plan — is this account "
        "churning, what is driving the contraction, and is there a remediation path?"
    ),
```

**Near-miss guard test function pattern** (`test_near_miss_guard.py` lines 221-234 — Q12, the exact shape to mirror):
```python
def test_near_miss_guard_q12(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q12: Usage green / sentiment red.

    Corpus is scoped to Meridian modules only (Q12 is Meridian-centric —
    the contradiction between green usage metrics and red sentiment lives
    entirely in Meridian's unstructured data).

    Top-1 retrieval must be a signal doc, not a near-miss.
    """
    _require_api_key()
    meridian_modules = ["meridian_slack", "meridian_email", "meridian_docs", "meridian_pdf"]
    docs = _load_unstructured_docs(load_unstructured_files, modules=meridian_modules)
    _assert_signal_top1(QUESTION_TEXTS["Q12"], docs, load_manifest)
```
Copy for Q13, replacing module list with `helio_*` and updating question key and docstring:
```python
def test_near_miss_guard_q13(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q13: Helio Retail churn / contraction (dual-graph).

    Corpus is scoped to Helio modules only — the contraction signal lives
    in Helio's unstructured data (Slack escalation, downgrade-rationale email,
    remediation doc).  Top-1 must be a Helio signal doc.
    """
    _require_api_key()
    helio_modules = ["helio_slack", "helio_email", "helio_docs", "helio_pdf"]
    docs = _load_unstructured_docs(load_unstructured_files, modules=helio_modules)
    _assert_signal_top1(QUESTION_TEXTS["Q13"], docs, load_manifest)
```

**`_require_api_key` skip guard** (`test_near_miss_guard.py` lines 88-91 — already present, call unchanged):
```python
def _require_api_key():
    """Skip the test if OPENAI_API_KEY is not set in the environment."""
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set — skipping near-miss guard (requires OpenAI API)")
```

**`_assert_signal_top1` helper** (`test_near_miss_guard.py` lines 176-213 — already present, call unchanged):
```python
def _assert_signal_top1(question_text: str, docs: list, manifest: dict) -> None:
    from corpus_graph.rrf import ReciprocalRankFusion
    ...
    assert role == "signal", (
        f"Near-miss guard FAILED: top-1 result is '{top_doc_name}' (role={role!r}), "
        f"expected a signal doc. RRF top-5: {[f['doc_id'] for f in fused[:5]]}"
    )
```

---

### `agent/test/questions.eval.test.ts` (MODIFY — add C `it()` blocks)

**`it()` block pattern for dual-graph question** (`questions.eval.test.ts` lines 127-150 — Q2):
```typescript
it(
  'Q2 — renewal risk + WHY [dual-graph]',
  async () => {
    const env = await askQuestion(
      'Is Meridian Logistics at risk at their upcoming renewal, and WHY? Use their ' +
        'contract renewal date and usage trend together with the CSM Slack notes, renewal ' +
        'emails, and QBR documents that explain any risk.',
    );
    assertWellFormed(env);
    expect(env.refused).toBe(false);
    expect(assertReconciliation(env)).toBe(true);
    expect(typeof env.groundingScore).toBe('number');
    expect(env.groundingScore).toBeGreaterThanOrEqual(0);
    expect(env.groundingScore).toBeLessThanOrEqual(1);
    expect(env.groundingScore).toBe(1.0);
    const { score, unsupported } = await faithfulness(env);
    expect(score, `Q2 unsupported claims: ${unsupported.map((c) => c.text).join(' | ')}`).toBeGreaterThanOrEqual(FAITHFULNESS_FLOOR);
  },
  TIMEOUT,
);
```
Copy for Q13 (C flagship dual-graph), updating question text, label string, and assertion comment. The dual-graph assertion `assertReconciliation(env)` is the key check (≥1 structured AND ≥1 unstructured `_id`).

**`it()` block pattern for structured-only anchor** (`questions.eval.test.ts` lines 100-125 — Q7):
```typescript
it(
  'Q7 — product-ladder adoption + ROI [structured-only anchor]',
  async () => {
    const env = await askQuestion(Q7_ANCHOR_PROMPT);
    assertWellFormed(env);
    expect(env.refused).toBe(false);
    // The intentional structured-only anchor: every citation is from the structured graph.
    expect(env.citations.length).toBeGreaterThan(0);
    for (const c of env.citations) expect(c.graph).toBe('structured');
    for (const cl of env.claims) expect(cl.citations.length).toBeGreaterThan(0);
    expect(typeof env.groundingScore).toBe('number');
    expect(env.groundingScore).toBeGreaterThanOrEqual(0);
    expect(env.groundingScore).toBeLessThanOrEqual(1);
    expect(env.groundingScore).toBe(1.0);
    const { score, unsupported } = await faithfulness(env);
    expect(score, `Q7 unsupported claims: ${unsupported.map((c) => c.text).join(' | ')}`).toBeGreaterThanOrEqual(FAITHFULNESS_FLOOR);
  },
  TIMEOUT,
);
```
Copy for C's structured-only anchor (Q15 or equivalent). If the prompt needs to be reused in a web canary, define `QC_ANCHOR_PROMPT` in `agent/src/index.ts` (see below) and import it here. Otherwise, inline the prompt string.

**Q12 centerpiece pattern with regex answer assertion** (`questions.eval.test.ts` lines 153-181):
```typescript
expect(env.answer).toMatch(/green|healthy|usage|metric/i);
expect(env.answer).toMatch(/red|risk|sentiment|dissatisf|unhappy|concern|contradict/i);
```
C's flagship Q13 should assert answer matches contraction vocabulary:
```typescript
expect(env.answer).toMatch(/declin|contract|downgrad|churn|at.risk/i);
```

**Module-level constants** (`questions.eval.test.ts` lines 59-84 — reuse as-is):
```typescript
const CAN_RUN = hasLiveDb() && hasOpenAi();
const d = CAN_RUN ? describe : describe.skip;
const TIMEOUT = 180_000;
const FAITHFULNESS_FLOOR = 0.6;
```
No changes. C's `it()` blocks go inside the existing `d(...)` describe block.

---

### `scripts/eval-gate.ts` (MODIFY — add C labels to LOCKED_QUESTION_LABELS)

**Existing `LOCKED_QUESTION_LABELS`** (`eval-gate.ts` line 157):
```typescript
const LOCKED_QUESTION_LABELS = ['Q7', 'Q2', 'Q12', 'Q9', 'Q5', 'Q8'];
```
Add C's question labels (whatever IDs are assigned — e.g. Q13, Q14, Q15):
```typescript
const LOCKED_QUESTION_LABELS = ['Q7', 'Q2', 'Q12', 'Q9', 'Q5', 'Q8', 'Q13', 'Q14', 'Q15'];
```
The `classifyTest` function (`eval-gate.ts` lines 159-177) does a case-insensitive `.includes(Q)` scan over the test name — so the new `it()` label strings must literally contain `Q13`/`Q14`/`Q15` (the existing pattern `'Q13 — ...'` satisfies this automatically).

---

### `agent/src/index.ts` (MODIFY — optional: add QC_ANCHOR_PROMPT constant)

**`Q7_ANCHOR_PROMPT` constant pattern** (`agent/src/index.ts` lines 41-45):
```typescript
export const Q7_ANCHOR_PROMPT =
  'For Northwind Analytics, show how they have adopted ArangoDB across the product ' +
  'ladder (Community to Enterprise to ArangoGraph) and the ROI we have delivered. ' +
  'Answer purely from the structured graph — their usage telemetry, contracts, and ' +
  'expansion opportunities; do not use any unstructured documents for this one.';
```
If C's anchor prompt needs cross-file reuse (web canary), add after this constant:
```typescript
/**
 * Q-C anchor prompt for Helio Retail (Account C — structured-only churn indicator).
 * Single source of truth; import from here (same discipline as Q7_ANCHOR_PROMPT).
 */
export const QC_ANCHOR_PROMPT =
  'For Helio Retail, summarize their product tier history, current contract status, ' +
  'and usage trend from the structured graph only — their contracts, usage telemetry, ' +
  'and CRM opportunities. Do not use unstructured documents for this question.';
```
If C's anchor is only tested in `questions.eval.test.ts` (no web canary), skip this change and inline the string directly in the `it()` block.

---

### `data_gen/generators/` — 8 generator files (MODIFY for DATA-05 deepening)

**DATA-05 deepening principle:** Edit prose templates and fact-builder helper functions. Do NOT add new DocEvents to existing modules where avoidable — every added doc increases distractor count for the near-miss guard. Prefer in-place content enrichment (richer `concern_topic`, `event_summary`, more `key_facts` items).

**Generator signatures confirmed** (no changes to function signatures for Account C — generators auto-iterate `_SPINES`):

| Generator | Signature | Scope | Line |
|-----------|-----------|-------|------|
| `crm_generator.py` | `generate_crm(spine: AccountSpine, output_dir: Path)` | single spine | 32 |
| `usage_generator.py` | `generate_usage(spine: AccountSpine, output_dir: Path)` | single spine | 21 |
| `contract_generator.py` | `generate_contracts(spine: AccountSpine, output_dir: Path)` | single spine | 18 |
| `slack_generator.py` | `generate_slack(spines: list[AccountSpine], output_dir, cache_dir)` | full `_SPINES` list, filters `endswith("_slack")` | 177 |
| `email_generator.py` | `generate_emails(spines: list[AccountSpine], output_dir, cache_dir)` | full list, filters `endswith("_email")` | 197 |
| `docs_generator.py` | `generate_docs(spines: list[AccountSpine], output_dir, cache_dir)` | full list, filters `endswith("_docs")` | 253 |
| `pdf_generator.py` | `generate_pdfs(spines: list[AccountSpine], output_dir, cache_dir)` | full list, filters `endswith("_pdf")` | 263 |

**Prose richness sites (DATA-05 deepening targets):**

For `slack_generator.py` — prose richness controlled by `_derive_concern_topic` (`slack_generator.py` lines 89-101) and `_build_facts_for_signal` (lines 47-72). Deepening = extend the `concern_topic` strings and add more context keys to the `facts` dict:
```python
def _derive_concern_topic(doc: DocEvent) -> str:
    if "Q12" in doc.questions_served:
        return "operational concerns and partnership health issues requiring escalation"
    if "Q2" in doc.questions_served:
        return "renewal risk and account health requiring immediate attention"
    ...
```
To deepen: make these strings longer and more specific (e.g. include contract value, specific product tier, named contacts). Add a `"Q13"` branch for Helio's churn topic.

For `email_generator.py` — prose richness controlled by `_derive_concern_description` and `_derive_subject_context` (analogous helpers; `email_generator.py` lines ~197-245). Same pattern: extend the description strings and add C's Q13 branch.

For `docs_generator.py` — prose richness controlled by `_derive_event_summary` and `_derive_key_facts` (`docs_generator.py` lines ~253-292). `key_facts_list` is a list of strings — add more items for richer docs (each item = one paragraph of structured content in the generated .md).

For structured generators (`crm`, `usage`, `contract`) — prose is NOT LLM-generated. Deepening = add more structured fields to the JSON records. E.g. in `crm_generator.py`, enrich the `accounts_records` dict with additional fields like `industry`, `region`, `csm_owner`, `tier`, `health_score_detail`.

**Module filter pattern** (`slack_generator.py` lines 196-199 / `email_generator.py` lines 215-217 / `docs_generator.py` lines 266-268) — all generators use the same per-spine per-doc filter:
```python
for spine in spines:
    for doc in spine.docs:
        if not doc.module.endswith("_slack"):  # or "_email", "_docs", "_pdf"
            continue
```
No changes needed here — Helio's docs are auto-covered once `HELIO_SPINE` is in `_SPINES`.

**Manifest entry pattern** (`slack_generator.py` lines 235-244 — same shape in all 4 unstructured generators):
```python
manifest[doc.file_name] = {
    "module": doc.module,
    "account_id": doc.account_id,
    "entity_id": doc.entity_id,
    "citable_url": doc.citable_url,
    "role": doc.role,
    "questions_served": doc.questions_served,
    "spine_events": doc.spine_events,
    "event_date": str(doc.event_date),
}
```
No changes needed — Helio's manifest entries are auto-generated.

**Prohibited terms pattern** (`slack_generator.py` lines 27-44 — must add Helio branch):
```python
_MERIDIAN_SLACK_PROHIBITED = [
    "escalation", "at risk", "competitor", "silent", "quota",
    "partnership health", "unresolved", "red flag", "disengaged",
]
_NORTHWIND_SLACK_PROHIBITED = [
    "scale limit", "GenAI", "GraphRAG", "upsell", "whitespace",
    "capacity", "renewal risk", "at risk", "escalation",
]

def _get_prohibited_terms(module: str, doc: DocEvent) -> list[str]:
    if module == "meridian_slack":
        return _MERIDIAN_SLACK_PROHIBITED
    return _NORTHWIND_SLACK_PROHIBITED
```
Add a `_HELIO_SLACK_PROHIBITED` list and a branch for `module == "helio_slack"`. The Helio prohibited terms for noise should exclude signal vocabulary: `"downgrade"`, `"contraction"`, `"migration-away"`, `"declining usage"`, `"churn"`, `"deprioritization"`. Same pattern in `email_generator.py`, `docs_generator.py`, `pdf_generator.py`.

---

## Shared Patterns

### Deterministic key helpers
**Source:** `data_gen/spine/entity_registry.py` lines 34-107
**Apply to:** `spine_helio.py` (all DocEvent, ContractEvent, UsageEvent, etc.)
```python
canonical_uuid("helio", "contact:alex_kim")   # → deterministic UUID, helio-scoped
make_file_name("helio_slack", "he_slack_escalation_2024q1", "txt")
make_citable_url("helio", "slack", "he_slack_escalation_2024q1")
# → "https://arangodb.com/demo/helio/slack/he_slack_escalation_2024q1"
```
Never use Python's `uuid.uuid4()` or random generators — the linter's `test_field_stamps` asserts the deterministic URL prefix.

### Account-scoped entity IDs
**Source:** `entity_registry.py` line 46
**Apply to:** Every event in `spine_helio.py`
```python
entity_id=canonical_uuid("helio", f"usage:{period}"),   # scope="helio" everywhere in helio spine
```
Using `"helio"` as scope prevents cross-account `entity_id` collision even when `name` portions match other accounts.

### `load_dotenv(override=True)` pattern
**Source:** `test_near_miss_guard.py` lines 28-32
**Apply to:** Any new Python entrypoint that reads env vars
```python
from dotenv import load_dotenv
_REPO_ROOT = Path(__file__).parent.parent.parent
load_dotenv(_REPO_ROOT / ".env", override=True)
```
`override=True` is mandatory — a stale shell `OPENAI_API_KEY` otherwise shadows the `.env` value and causes 401 errors.

### Pytest skip-not-fail pattern
**Source:** `conftest.py` lines 48-56 (manifest fixture)
**Apply to:** Any new linter fixture
```python
if not manifest_path.exists():
    pytest.skip("manifest not yet generated — run data_gen/generate.py first")
```
All linter fixtures skip (never fail) when generated data is absent — this allows the suite to be collected with no data present.

### Vitest `describe.skip` when env absent
**Source:** `questions.eval.test.ts` lines 72-73
**Apply to:** All new `it()` blocks (they live inside the same `d(...)` block)
```typescript
const CAN_RUN = hasLiveDb() && hasOpenAi();
const d = CAN_RUN ? describe : describe.skip;
```
No new guard needed — C's `it()` blocks go inside the existing `d(...)` block and inherit the skip automatically.

### Eval-gate `classifyTest` string matching
**Source:** `eval-gate.ts` lines 159-161
```typescript
if (LOCKED_QUESTION_LABELS.some((q) => upper.includes(q))) return 'locked';
```
C's `it()` label strings must contain `Q13`/`Q14`/`Q15` literally (e.g. `'Q13 — helio churn / contraction [dual-graph]'`). The `upper.includes(Q)` check matches substring — label strings in `questions.eval.test.ts` must not omit the Q-number.

---

## No Analog Found

All files have close analogs in the codebase. No file requires starting from scratch using only RESEARCH.md patterns.

---

## Metadata

**Analog search scope:** `data_gen/spine/`, `data_gen/generators/`, `data_gen/linter/`, `agent/test/`, `agent/src/`, `scripts/`
**Files read:** 13 source files (entity_registry.py, event_spine.py, spine_meridian.py, generate.py, conftest.py, test_answerability.py, test_near_miss_guard.py, questions.eval.test.ts, eval-gate.ts, crm_generator.py, slack_generator.py partial, email_generator.py partial, docs_generator.py partial)
**Pattern extraction date:** 2026-06-22
