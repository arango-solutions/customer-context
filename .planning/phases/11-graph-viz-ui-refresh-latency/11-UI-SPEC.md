---
phase: 11
slug: graph-viz-ui-refresh-latency
status: draft
shadcn_initialized: true
preset: "new-york / slate base (inherited Phase 6; components.json present)"
created: 2026-06-23
---

# Phase 11 — UI Design Contract

> Visual and interaction contract for the **graph viz + brand refresh + latency + trust-chip** phase. Honors LOCKED decisions D-01..D-12 in `11-CONTEXT.md` and **inherits the established Phase 6 contract** (`06-UI-SPEC.md`) — this phase EXTENDS that contract, it does not redefine it. Verified by gsd-ui-checker.

This phase is **presentation + latency only** — no change to the agent's answer *data* (envelope/grounding/eval). It adds four things on top of the v1 surface: (1) a **React Flow cross-graph subgraph** (VIZ-02), (2) an **ArangoDB-brand token pass + targeted polish** (UI-04), (3) a **per-answer trust chip** (UI-06), and (4) a **latency pass** (PERF-01). It also folds in backlog 999.2 by re-rendering `AnswerBody` as a **numbered claim list** (D-12). The CARDINAL RULE holds throughout: the persistent answer is the terminal-gated grounded envelope; the viz renders once from that terminal envelope (D-07), never mid-stream.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **shadcn** — already initialized (`web/components.json` present). Phase 11 adds NO new shadcn init. |
| Preset | `style: new-york`, `baseColor: slate`, `cssVariables: true`, `rsc: true` (from `components.json`) |
| Component library | **shadcn/ui (Radix primitives) + Tailwind v4** (CSS-config via `@import "tailwindcss"` + `@theme inline` in `app/globals.css`; no `tailwind.config.*`). Existing ui atoms: button, textarea, card, badge, sheet (drawer), separator, scroll-area, tooltip. |
| Icon library | **lucide-react** (`^0.469.0`) — no second icon dep |
| Font | **Inter** (variable, `--font-inter`) for body + UI; **JetBrains Mono** (`--font-jetbrains-mono`) for all `_id` / AQL / collection / traversal / edge-label code. Both wired in `layout.tsx` via `next/font/google`. |
| New dependency (this phase) | **`@xyflow/react` v12** (React Flow) — net-new, NOT yet installed. Used ONLY for the `<GraphViz>` panel. Node runtime is the client; React Flow is a client-component dep. |

> Inherited theming source of truth: `web/app/globals.css` (`:root` + `.dark` + `@theme inline`). Phase 11's "brand token pass" (D-08/D-09) ADJUSTS these existing CSS-variable values; it does NOT introduce a parallel token system.

---

## Spacing Scale

Inherited verbatim from Phase 6 (8-point scale, multiples of 4). No phase-11 changes to the scale itself.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Edge-legend swatch gap, badge inner padding, claim-superscript gap, icon-to-text gap |
| sm | 8px | Compact stacking inside cards; node-internal label/sub-label gap |
| md | 16px | Default element spacing; card padding; claim-list line rhythm; viz panel inner padding |
| lg | 24px | Section padding; gap between answer body and rail groups; viz-panel-to-legend gap |
| xl | 32px | Layout gaps; question box vertical breathing room |
| 2xl | 48px | Major section breaks; empty-state vertical offset |
| 3xl | 64px | Page-level top/bottom padding on the main column |

Exceptions (inherited + phase-11 additions):
- **44px** minimum hit target — claim superscripts, drawer trigger, **viz node click target**, **Graph/Path toggle buttons** (accessibility floor; the rendered node may be visually smaller but its interactive area ≥ 44px).
- **480px** SourceDrawer width (desktop); full-width mobile.
- **React Flow canvas:** minimum rendered height **320px**, default **420px** within the rail's available width; the canvas is a fixed-aspect surface, not a scale token (justified by graph legibility — a star/bridge layout needs vertical room).

---

## Typography

Inherited verbatim from Phase 6. Exactly **2 weights** (400 regular, 600 semibold); the Code role uses the mono family at 400. No new weights this phase. Phase-11 additions map new elements onto the EXISTING roles.

| Role | Size | Weight | Line Height | Phase-11 usage |
|------|------|--------|-------------|----------------|
| Body (answer prose, claim-list lines, card text) | 16px | 400 | 1.5 | Each numbered claim line (D-12) renders at Body |
| Label (badges, field labels, chip text, timeline steps, **edge-legend labels**, **trust-chip label**, **Graph/Path toggle labels**, **viz node titles**) | 14px | 600 | 1.4 | Trust chip "Grounded ✓" text; legend entries; toggle text; node titles |
| Heading (section headers, drawer title, **viz panel header**) | 20px | 600 | 1.3 | "Graph" / "Path" panel context header |
| Display (question echo / empty-state headline) | 28px | 600 | 1.2 | unchanged |
| Code (AQL, `_id`, collection, traversal, **edge `_id`/`label` on hover**, **node `_id` sublabels**) | 14px | 400 (JetBrains Mono) | 1.5 | Node `_id` sublabel; edge hover-label collection/`_id` |

---

## Color

ArangoDB-branded, **60/30/10** split. Phase 11 INHERITS the live token set in `globals.css` (the documented working palette, proven through the v1 demo) and applies D-08/D-09 as a refinement pass against arangodb.com / the ArangoGraph console. The 60/30/10 structure and the structured-vs-unstructured two-color rule are the fixed contract; exact hex is confirmable detail.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#FFFFFF` (light) / `#0F1B24` (dark) | Page background, main answer column, **React Flow canvas background** |
| Secondary (30%) | `#F4F6F8` (light) / `#1A2733` (dark) | Sourcing rail, citation cards, drawer, chips, **viz panel surface**, **trust-chip surface (grounded)**, **super-node body fill** |
| Accent (10%) | `#5C9E31` (ArangoDB green) | RESERVED list below only |
| Destructive / refusal | `#B4451F` (warm clay, NOT alarm-red) | Refusal banner accent + "cannot answer" state only; **trust chip in a refused/partial state borrows this for the chip rule only** |

**Accent (`#5C9E31`) reserved for:** the primary **Ask** button; the question-box focus ring; the **structured-graph badge**; the active/completed dot on the reasoning timeline; the **numbered-claim superscript link / claim-list number markers**; the **active half of the Graph/Path toggle**; the **"Grounded ✓" trust chip when grounded**. NOT for body text, card borders, generic hover states, or non-structured viz edges.

**Graph-origin colors (dual-graph signal — load-bearing for the demo):**
- `structured` → ArangoDB green `#5C9E31` (filled). Applies to structured citation badges AND the **structured cluster nodes** in the viz.
- `unstructured` → slate-blue `#3A6EA5` (filled). Applies to unstructured citation badges AND the **unstructured (Chunk/Document) cluster nodes** in the viz.
- Tokens already exist: `--graph-structured`, `--graph-unstructured` (+ `-foreground`). The viz MUST consume these, not hardcode hex, so the badge convention and the node convention never drift.

**Viz edge-kind colors (the honesty signal — see Edge Visual Language below):** edge KIND is differentiated by **line style first** (load-bearing), with color as a secondary cue. Edge color stays muted/neutral (`--muted-foreground` family) so the green/slate-blue NODE convention stays the dominant graph-origin signal and edges don't fight it. Specifically: traversed/structural/hybrid edges all draw in a neutral foreground tone, distinguished by **stroke style** (solid/dashed/dotted) + the always-visible legend. Color is NOT the primary edge discriminator (colorblind-safe; structure carries the meaning).

> ASSUMPTION (documented, inherited from Phase 6): confirm exact ArangoDB green + dark surface + any updated brand neutrals against the official media kit / ArangoGraph console during execution; swap the `globals.css` token VALUES if they differ. `www.arangodb.com` now 301-redirects to `arango.ai/`; automated fetch yielded no machine-readable tokens (CSS not exposed). The token STRUCTURE is the contract; the planner/executor verifies hex from the live console.

---

## React Flow Graph Viz (VIZ-02) — Visual & Interaction Contract

The viz is **fully general / data-driven** (LOCKED): it renders for ANY question purely from `envelope.retrievalPath[].edges[]` + node `_ids`, with **zero per-question hardcoding or template** (REQUIREMENTS.md VIZ-02). It renders ONCE from the terminal grounded envelope (D-07), built strictly from the grounded path the answer cites — never a decorative re-query.

### Node model (D-01, D-02, D-03)

| Node type | Source | Visual | Color |
|-----------|--------|--------|-------|
| **Question anchor** | synthetic single node (`question/current`, D-02) | rounded pill, neutral surface, anchors where retrieval started; `hybrid` edges fan OUT from it | `--secondary` fill, `--foreground` text |
| **Chunk node** (unstructured) | cited Chunk `_ids` | rounded-rect, slate-blue origin | `--graph-unstructured` |
| **Document node** (unstructured) | owning Document via real `PART_OF` edge | rounded-rect, slate-blue origin, slightly larger than Chunk | `--graph-unstructured` |
| **Structured record node** | cited structured `_ids`, account-induced | rounded-rect, green origin | `--graph-structured` |
| **Collection super-node** (D-03) | grouping of same-collection records (e.g. `UsageFact ×12`) | rounded-rect with a count badge; **expandable on click** to reveal individual record nodes; collapsed by default | origin color of its cluster |

- Unstructured cluster renders at **Chunk → Document** level; **AutoGraph community/cluster internals are HIDDEN** (D-01).
- Node count is **capped to cited records** (LOCKED). The super-node grouping (D-03) keeps the default view demo-legible; individual records are detail-on-demand.
- Node title = collection name (14px/600); sublabel = truncated `_id` (JetBrains Mono 14px/400).

### Edge Visual Language (D-04 — LOAD-BEARING HONESTY)

The 3 edge `kind`s (already emitted by Phase 10 tools — `kind`/`label` on `RetrievalPathEdge`) map 1:1 to **line style + an always-visible legend**. A structural/induced edge must NEVER be drawn as a traversal.

| Edge kind | Stroke style | Meaning | Legend entry |
|-----------|-------------|---------|--------------|
| `traversed` (`PART_OF`, `same_as`) | **solid** | a real graph walk the agent performed | `— Traversed (PART_OF / same_as)` |
| `structural` (`account_id`-induced) | **dashed** | account-anchored induced subgraph, NOT a walk | `-- Structural (account-induced)` |
| `hybrid` (vector + BM25 match) | **dotted** | a retrieval MATCH from the Question anchor, not a traversal | `··· Hybrid match (vector + BM25)` |

- The legend is **always visible** within the viz panel (not hover-gated) so a Zscaler buyer reads the honesty distinction at a glance — the structured cluster is visibly *induced*, not walked.
- The **cross-graph link** is the real `same_as` bridge edge (solid/traversed) joining the two clusters — the single most load-bearing edge in the demo.
- Edges reflect the **post-guard** edge set (`enforceEdgeHonesty` / `traversedEdgesAreGrounded` in `agent/src/retrievalPath.ts`). The viz never re-derives or invents edges.

### Layout

- Two visual clusters: **structured (green, left)** and **unstructured (slate-blue, right)**, joined by the `same_as` bridge in the middle; the **Question anchor** sits adjacent to the unstructured cluster (where hybrid retrieval starts).
- Layout algorithm is the planner/executor's call (e.g. a simple two-column/star arrangement or a light force/dagre pass) — the CONTRACT is: two legible clusters + a visible bridge + the Question anchor, stable for arbitrary traversal shapes, never overlapping at the cited-record cap.

### Reveal timing (D-07)

- Renders **once** from the terminal grounded envelope, with a **brief reveal/layout-in animation** (fade + settle, ≤ 400ms, ease-out). No progressive/mid-stream build — `ReasoningTimeline` already owns the mid-stream "thinking" feel.

### Interaction (D-06)

| Trigger | Behavior |
|---------|----------|
| **Click node** | opens the existing **SourceDrawer** scoped to that node's record (reuse `SourceDrawer.tsx`; no new drawer). Super-node click EXPANDS it (reveals member nodes); a member-node click opens the drawer. |
| **Hover edge** | reveals the edge's label (`PART_OF` / `same_as` / `account` / `hybrid`) in a tooltip (reuse the existing Radix tooltip atom), with the edge collection + `_id` in mono. |
| **Keyboard** | nodes are focusable; Enter activates the same action as click; the canvas is escapable (focus does not trap). |

---

## Placement & Toggle (D-05)

- A **Graph / Path toggle** lives **inside the existing sourcing rail** (`RetrievalPathByGraph` region). It is a 2-segment control:
  - **"Graph"** → the new `<GraphViz>` React Flow panel.
  - **"Path"** → today's text breakdown (`RetrievalPathByGraph`: grouped collections + record counts + expandable AQL).
- **Both honest views coexist**; "Path" is NOT removed. Default selection: **Path** (lowest-regression default; the streamed-reasoning + text-path flow is the eval-tested v1 experience). The toggle's active segment uses the accent green.
- Low regression risk to the streamed-reasoning layout: the toggle swaps only the content of the existing "Retrieval path" rail section.

---

## Answer Rendering — Numbered Claim List (D-12, folds 999.2)

`AnswerBody` changes from prose-with-trailing-superscripts to a **numbered claim list**:

- Render `envelope.claims[]` as an ordered list; each line = one claim's `text`.
- Each claim line carries a **superscript marker** (`[n]` / ¹²³) in accent green linking to that claim's `citations[]` → opens the shared SourceDrawer (reuse `ClaimSuperscript` + the rail's `openSource` handle).
- This **sidesteps the fuzzy claim→prose-span mapping** (claim text is not guaranteed to be a verbatim substring of `answer`). Every fact is unambiguously sourced — the strongest expression of "every fact traceable."
- The envelope DATA (`claims[]` / `answer`) is UNCHANGED — this is a rendering change only. Faithfulness/grounding stay green (UI concern, not eval concern).
- Markers retain the **44px hit area** + `aria-label="View sources for claim {n}"` (inherited).
- Refused envelopes still route to `RefusalPanel`, never to the claim list.

> PLANNING NOTE (from CONTEXT D-12): verify the claim-list rendering does not regress the streamed-reasoning UX — the terminal grounded envelope is still the only persistent answer; `ReasoningTimeline` remains the transient mid-stream surface.

---

## Trust Chip (UI-06, D-10 / D-11)

A **per-answer** trust signal (D-11: per-answer only — the claim-list markers already carry per-claim traceability; a per-claim score would be redundant/noisy).

- **Headline = qualitative chip**, driven by `groundingScore` + refusal state:
  - grounded → **"Grounded ✓"** chip, accent-green surface/text.
  - partially grounded / refused → **"Partially grounded"** / refusal-framed chip, warm-clay (`--destructive`) rule — calm, not alarm.
- **Numeric `faithfulnessScore`** (the variable one, ≥ 0.6 eval floor) is **revealed on hover/expand** (reuse the tooltip atom) for technical buyers.
- Rationale (D-10): `groundingScore` is ~always `1.0` for grounded answers (vanity %), so lead with an HONEST qualitative word and keep the variable number a hover away.
- Reads `envelope.groundingScore` + `envelope.faithfulnessScore` (both already on the envelope from Phase 8) — **no new compute**.
- Placement: adjacent to the answer headline (top of the main column, near the question echo), 14px/600 label.

---

## Latency Pass (PERF-01) — Discretion (no UI-token impact)

PERF-01 is a runtime/agent-loop concern with **no user-facing visual-token contract** beyond the existing no-dead-air state machine (inherited Phase 6). Decisions are left to research/planning (CONTEXT discretion): pursue parallel tool calls / pre-warm / caching to noticeably beat v1's ~20–40s, with **no loss of grounding**. UI contract: the existing streamed `ReasoningTimeline` no-dead-air guarantees still hold; first-token arriving faster only IMPROVES the existing experience. Any loop change MUST go through the shared `buildToolLoopAgent` factory (so streaming + non-streaming stay in sync) and be smoke-tested on the streaming UI before a demo (eval gate tests only the non-streaming path).

> No user-facing latency SLA is locked (deferred per CONTEXT). Surface a target in PLAN only if research finds a meaningful tradeoff.

---

## Copywriting Contract

Inherited copy (Ask CTA, placeholders, empty/error/timeout/refusal states, drawer title, path group headers) carries **verbatim from Phase 6** — no change. Phase-11 ADDITIONS:

| Element | Copy |
|---------|------|
| Primary CTA (inherited) | **Ask** (unchanged) |
| Graph/Path toggle | segment labels: **`Graph`** / **`Path`** |
| Viz empty/edge-light state | `No traversed edges to draw for this answer — see the Path view for the records and queries.` (shown when a grounded answer has nodes but no renderable edges) |
| Edge legend | `Traversed (PART_OF / same_as)` · `Structural (account-induced)` · `Hybrid match (vector + BM25)` |
| Super-node label | `{Collection} ×{n}` (e.g. `UsageFact ×12`) — `Click to expand` sublabel/affordance |
| Trust chip (grounded) | **`Grounded ✓`** (hover: `Faithfulness {score} · grounding {score}`) |
| Trust chip (partial/refused) | **`Partially grounded`** (hover reveals the numeric scores) |
| Node click hint (a11y) | `aria-label="Open source — {graph} · {collection} · {_id}"` |
| Edge hover label | `{label} · {collection}` (mono) |

**Destructive actions in this phase:** **none.** Read-only demo; no delete/confirm flows (inherited). The `--destructive` clay slot is used only for the refusal header rule and the partial/refused trust-chip rule.

---

## Component Inventory (phase-11 delta)

Inherited components (unchanged unless noted): `QuestionBox`, `ExampleChips`, `ReasoningTimeline`, `CitationCard`, `SourceDrawer`, `RetrievalPathByGraph`, `SourcingRail`, `RefusalPanel`, `ErrorState`/`TimeoutState`, `EmptyState`, `GraphBadge`, ui atoms (button, textarea, card, badge, sheet, separator, scroll-area, tooltip).

| Component | Status | Renders from | Spec |
|-----------|--------|--------------|------|
| **`GraphViz`** | NEW | `envelope.retrievalPath[].edges[]` + node `_ids` | React Flow (`@xyflow/react`) canvas: two origin-colored clusters + Question anchor + `same_as` bridge; 3 edge stroke-styles + always-visible legend; super-node grouping (expandable); node-click → SourceDrawer, edge-hover → tooltip. Reveal-in animation. Consumes `--graph-structured`/`--graph-unstructured` + `--muted-foreground` tokens (never hardcoded hex). Fully data-driven; no per-question template. |
| **`GraphPathToggle`** | NEW (may be inline) | toggle state | 2-segment control inside the rail's "Retrieval path" section; active = accent green; swaps `GraphViz` ↔ `RetrievalPathByGraph`. Default = Path. |
| **`TrustChip`** | NEW | `envelope.groundingScore` + `faithfulnessScore` + `refused` | Qualitative chip (Grounded ✓ / Partially grounded) near the answer headline; numeric faithfulness on hover (tooltip). No new compute. |
| **`AnswerBody`** | MODIFIED (D-12) | `envelope.claims[]` | Re-render as a numbered claim list; each line carries a `ClaimSuperscript` → shared drawer. Replaces prose+trailing-superscripts. Data unchanged. |
| **`RetrievalPathByGraph`** | UNCHANGED | `retrievalPath[]` | Becomes the "Path" half of the toggle; NOT removed (D-05). |
| **`SourceDrawer`** | UNCHANGED (reused) | citation(s) | Node-click target for `GraphViz` (D-06). No new drawer. |

---

## Accessibility Basics (inherited + phase-11 additions)

- Graph distinction is **NOT color-only**: GraphBadges keep text labels; viz NODES carry the collection-name title (text), and viz EDGES are distinguished primarily by **stroke style** (solid/dashed/dotted) + a text legend — colorblind-safe.
- Viz nodes are keyboard-focusable with `aria-label`s; Enter activates the same action as click; the canvas does not trap focus (Esc/Tab escapes).
- The Graph/Path toggle is a labeled, keyboard-reachable segmented control with `aria-pressed`/`role="tab"` semantics; visible accent focus ring.
- Trust chip text conveys state without relying on color alone ("Grounded ✓" / "Partially grounded"); numeric scores announced via the tooltip's accessible name.
- The numbered claim list uses semantic `<ol>`; each superscript keeps its 44px hit area + `aria-label`.
- Reveal animation respects `prefers-reduced-motion` (instant render, no fade/settle, when set).
- Light theme is the demo default (projector legibility); dark tokens declared for completeness (inherited).

---

## Out of Scope (explicit — Phase 11)

- **CDC / what-changed diff** → Phase 12.
- **Injection-resistance / "try-to-break-it" mode** → Phase 13.
- **Temporal queries** → Phase 14.
- **Multi-turn / conversation history (999.3)** → Phase 15-ish; the single-answer surface is NOT extended to hold a list of past envelopes this phase.
- **Per-claim confidence scoring** → rejected (D-11); per-claim traceability is the claim-list markers.
- **Hybrid retrieval scores (vector/BM25/RRF rank) on edges** → deferred (Phase 10 D-03); not surfaced in the viz this phase.
- **Any change to the answer DATA** (envelope/grounding/eval/`claims[]`) — presentation + latency only.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | button, textarea, card, badge, sheet (drawer), separator, scroll-area, tooltip (all already installed); no NEW shadcn blocks required this phase | not required |
| third-party | **none declared** | not applicable |

`@xyflow/react` is a standard **npm package dependency** (declared in `web/package.json`), NOT a shadcn registry block — it does not go through the shadcn registry vetting gate. No third-party shadcn registries are declared. If the executor later wants a community shadcn block, the registry vetting gate (`shadcn view` + pattern scan) MUST run before it enters the contract.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
