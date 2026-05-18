/**
 * Token-budget estimator for the agent loop.
 *
 * Real token counts only come from the provider response (`usage.prompt_tokens`).
 * Between provider calls we approximate with a `chars / 4` heuristic, which is
 * coarse but inexpensive and good enough for the 75% compaction threshold.
 *
 * The estimator is intentionally pessimistic — overcounting is safer than
 * undercounting because we'd rather compact a turn early than blow the
 * provider's context window.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';

/** Fallback chars-per-token. OpenAI/Anthropic both land near this empirically. */
const CHARS_PER_TOKEN = 4;

/** Per-message scaffolding (role markers, JSON shape) — adds a few tokens each. */
const PER_MESSAGE_OVERHEAD = 4;

/**
 * Estimate token count for a single chat message. Includes any tool_calls
 * arguments string and tool_call_id, which are non-trivially sized.
 */
export function estimateMessageTokens(m: ChatMessage): number {
  let chars = 0;
  if (typeof m.content === 'string') chars += m.content.length;
  // Assistant turns may carry tool_calls; the model is billed for the JSON.
  if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      chars += tc.id.length + tc.function.name.length + tc.function.arguments.length;
    }
  }
  if (m.role === 'tool' && typeof m.tool_call_id === 'string') {
    chars += m.tool_call_id.length;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN) + PER_MESSAGE_OVERHEAD;
}

/** Sum estimated tokens across a history. */
export function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) total += estimateMessageTokens(m);
  return total;
}

export interface BudgetStatus {
  used: number;
  budget: number;
  fraction: number;
  /** True when used / budget >= threshold (default 0.75). */
  overThreshold: boolean;
}

/** Compute usage vs budget. `used` may be supplied from `provider.usage` if known. */
export function computeBudgetStatus(
  messages: ChatMessage[],
  budget: number,
  opts: { used?: number; threshold?: number } = {},
): BudgetStatus {
  const used = opts.used ?? estimateTokens(messages);
  const threshold = opts.threshold ?? 0.75;
  const fraction = budget > 0 ? used / budget : 0;
  return {
    used,
    budget,
    fraction,
    overThreshold: fraction >= threshold,
  };
}
