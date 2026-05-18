/**
 * History compaction.
 *
 * When a turn's token budget exceeds the configured threshold (default 75%),
 * we ask the provider to summarize the pre-recent prefix and replace it with
 * a single synthetic user message holding the summary. The last `recentN`
 * turns (default 6) survive verbatim so in-flight context is preserved.
 *
 * Shape after compaction:
 *
 *     [system]                                 ← caller manages separately
 *     [user: "<summary of earlier turns>"]     ← synthetic
 *     ...last recentN messages verbatim...
 *
 * Compaction itself uses one extra provider call; callers should invoke this
 * between agent-loop iterations, not mid-iteration. A 60-turn hard cap acts
 * as a runaway safety net regardless of token math.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type { CompletionFn } from '../agent/agent-loop.js';

/** How many trailing messages to keep verbatim. */
export const DEFAULT_RECENT_N = 6;

/** Hard cap on total messages — kicks in even when token math is fine. */
export const HARD_TURN_CAP = 60;

const COMPACTION_SYSTEM = `You are a conversation summarizer.
Read the conversation history and produce a concise summary that preserves:
- The user's overall goal and any in-progress task
- Files, paths, identifiers, decisions, and constraints that have been mentioned
- Tool call results that contain load-bearing facts (file contents, search hits, errors)
Drop pleasantries, formatting, and step-by-step prose. Output the summary as plain text.`;

export interface CompactHistoryOptions {
  /** Provider call function. Same signature as the agent loop uses. */
  completeFn: CompletionFn;
  /** Number of trailing messages to keep verbatim. Defaults to DEFAULT_RECENT_N. */
  recentN?: number;
  /** Token budget for the compaction request itself. */
  maxTokens?: number;
}

export interface CompactHistoryResult {
  history: ChatMessage[];
  summary: string;
  /** Number of messages folded into the summary (excludes the recent tail). */
  compactedCount: number;
}

/**
 * Replace the pre-recent prefix of `history` with a one-message summary.
 *
 * If the history is already shorter than `recentN`, returns it unchanged.
 * The system prompt is NOT part of `history` here — `runAgentTurn` passes it
 * separately and re-prepends on each iteration.
 *
 * Two safety adjustments to the cut point:
 *   1. **Tool-call ID continuity.** If the kept tail starts with `role:'tool'`,
 *      its `tool_call_id` references an `assistant` `tool_calls` entry that
 *      would be inside the summarized prefix. Most providers reject orphaned
 *      tool messages. We extend the prefix until the tail starts with a
 *      non-tool message.
 *   2. **No consecutive `user` messages.** Anthropic specifically rejects two
 *      `user` messages in a row. The synthetic summary message is a `user`,
 *      so if the tail's first message is also `user`, we drop one extra
 *      message from the head of the tail (folding it into the summary).
 */
export async function compactHistory(
  history: ChatMessage[],
  opts: CompactHistoryOptions,
): Promise<CompactHistoryResult> {
  const recentN = opts.recentN ?? DEFAULT_RECENT_N;
  if (history.length <= recentN) {
    return { history, summary: '', compactedCount: 0 };
  }

  let cut = history.length - recentN;

  // (1) Walk the cut point forward while the kept tail's first message is a
  //     tool result — those would be orphans without their assistant turn.
  while (cut < history.length && history[cut]?.role === 'tool') {
    cut += 1;
  }

  const prefix = history.slice(0, cut);
  let tail = history.slice(cut);

  const transcript = renderTranscript(prefix);

  const res = await opts.completeFn(
    [
      { role: 'system', content: COMPACTION_SYSTEM },
      {
        role: 'user',
        content: `Summarize the following conversation prefix.\n\n---\n${transcript}\n---`,
      },
    ],
    { maxTokens: opts.maxTokens },
  );

  const summary = (res.content ?? '').trim() || '(no summary produced)';

  // (2) Avoid two consecutive `user` messages. The synthetic summary is `user`,
  //     so if the tail also starts with `user`, fold its first message into the
  //     summary by skipping it from the kept tail.
  if (tail.length > 0 && tail[0]?.role === 'user') {
    const folded = tail[0];
    const foldedText =
      typeof folded.content === 'string' ? folded.content : '';
    tail = tail.slice(1);
    return {
      history: [
        {
          role: 'user',
          content: `[Conversation summary]\n${summary}\n\n[Last user message]\n${foldedText}`,
        },
        ...tail,
      ],
      summary,
      compactedCount: prefix.length + 1,
    };
  }

  return {
    history: [
      { role: 'user', content: `[Conversation summary]\n${summary}` },
      ...tail,
    ],
    summary,
    compactedCount: prefix.length,
  };
}

/**
 * Cheap line-oriented rendering for compaction. We don't replay tool_calls in
 * full structure — the summary only needs the gist.
 */
function renderTranscript(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const c = typeof m.content === 'string' ? m.content : '';
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      lines.push(`tool[${m.tool_call_id ?? '?'}]: ${truncate(c, 600)}`);
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const calls = m.tool_calls
        .map((t) => `${t.function.name}(${truncate(t.function.arguments, 200)})`)
        .join(', ');
      lines.push(`assistant: ${truncate(c, 400)} [calls: ${calls}]`);
      continue;
    }
    lines.push(`${m.role}: ${truncate(c, 800)}`);
  }
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
