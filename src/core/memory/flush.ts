/**
 * Memory flush on session end and compaction.
 *
 * Extracts durable facts from conversation history when:
 * 1. The session ends (session_end hook)
 * 2. Compaction produces a summary (pre_compact/post_compact)
 *
 * This ensures load-bearing facts are persisted before they are
 * compressed away or the session closes.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type { CompletionFn } from '../agent/agent-loop.js';
import { extractMemoryFacts } from './auto-extract.js';

export interface FlushOptions {
  projectRoot: string;
  history: ChatMessage[];
  completeFn: CompletionFn;
  /** Optional summary from compaction to also extract from. */
  compactionSummary?: string;
}

/**
 * Extract and save durable facts from the conversation.
 * Called at session end or after compaction.
 *
 * @returns Array of saved facts (empty if none extracted)
 */
export async function flushMemoryOnSessionEnd(
  opts: FlushOptions,
): Promise<Array<{ name: string; type: string }>> {
  if (opts.history.length < 2) return [];

  try {
    const facts = await extractMemoryFacts(
      opts.projectRoot,
      opts.history,
      opts.completeFn,
    );
    return facts.map((f) => ({ name: f.name, type: f.type }));
  } catch {
    // Flush failures are non-critical
    return [];
  }
}

/**
 * Extract facts from a compaction summary.
 * The summary is a rich source of durable facts that might otherwise
 * be lost during history compression.
 */
export async function flushMemoryFromCompaction(
  projectRoot: string,
  summary: string,
  completeFn: CompletionFn,
): Promise<Array<{ name: string; type: string }>> {
  if (!summary.trim()) return [];

  // Create a synthetic conversation from the summary
  const syntheticHistory: ChatMessage[] = [
    { role: 'user', content: 'Summarize what we discussed so far.' },
    { role: 'assistant', content: summary },
  ];

  try {
    const facts = await extractMemoryFacts(
      projectRoot,
      syntheticHistory,
      completeFn,
    );
    return facts.map((f) => ({ name: f.name, type: f.type }));
  } catch {
    return [];
  }
}
