// agent/src/sanitize.ts
//
// SEC-01 (D-01b) — shared delimiter-neutralizer for UNTRUSTED retrieved content.
//
// PURPOSE: retrieved chunk content from the unstructured graph is UNTRUSTED
// customer-document text. Before it is wrapped in <untrusted_document>...
// </untrusted_document> delimiters and handed to the planner (in runHybridRetrieve),
// any XML boundary markers it contains are neutralized so the chunk text cannot
// (a) spoof a closing delimiter to "break out" of the untrusted region, nor
// (b) forge a <system>/<instructions>/<tool_output>/<claim>/<evidence> block that
// the model might read as authoritative framing.
//
// This is the LIVE-PATH analog of the eval judge's CR-01 marker neutralization in
// faithfulness.ts L164-171. The two share the same approach (a pure `.replace()`
// chain). faithfulness.ts continues to read DOCUMENT(_id) straight from the DB, so
// it is unaffected by tool-return wrapping (Pitfall 6) — that is why this module
// exists separately and is applied IN MEMORY at the tool-return boundary only;
// delimiters are NEVER persisted to customer360_Chunks.
//
// DISCIPLINE (mirrors faithfulness.ts module header L15-20):
//   • PURE: no model call, no I/O, no `loadEnv` import, no DB/provider import.
//     Synchronous and deterministic — unit-testable byte-for-byte.
//   • Strip DELIMITER spoofing ONLY. Do NOT attempt injection-INTENT detection
//     (no "ignore previous instructions" regex) — that is brittle and is handled
//     structurally by the grounding gate (grounding.ts, the untouched backstop)
//     plus the DATA-not-instructions precedence section in PLANNER_SYSTEM_PROMPT
//     (RESEARCH Anti-Patterns; "strip delimiter spoofing only").

/** The opening delimiter that wraps untrusted retrieved content for the planner. */
export const UNTRUSTED_OPEN = '<untrusted_document>';

/** The closing delimiter that wraps untrusted retrieved content for the planner. */
export const UNTRUSTED_CLOSE = '</untrusted_document>';

/**
 * Neutralize boundary markers in untrusted retrieved content so the text cannot
 * spoof the wrapping delimiter or forge a system/instruction/tool/judge block.
 *
 * Transform (mirrors faithfulness.ts L164-171 in spirit):
 *   1. <untrusted_document> / </untrusted_document>  → [untrusted_document]
 *   2. <system|instruction|instructions|tool_output|claim|evidence> (open/close)
 *      → [<token>]  (the captured token, sans angle brackets / slash)
 * Both passes are case-insensitive and global. Ordinary prose with no markers is
 * returned unchanged byte-for-byte.
 *
 * @param raw - the untrusted chunk content as fetched from the DB.
 * @returns the same text with boundary markers replaced by bracketed placeholders.
 */
export function sanitizeUntrustedContent(raw: string): string {
  return raw
    // 1. Collapse any open/close untrusted_document delimiter to a visible placeholder
    //    so the chunk cannot close (or re-open) the wrapping region.
    .replace(/<\/?untrusted_document>/gi, '[untrusted_document]')
    // 2. Collapse the framing tokens (open OR close form) to a bracketed placeholder
    //    that preserves the token name as DATA. instruction(s) covers both forms.
    .replace(/<\/?(system|instructions?|tool_output|claim|evidence)>/gi, '[$1]');
}
