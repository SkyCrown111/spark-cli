/**
 * Memory relevance scoring.
 *
 * Provides TF-IDF-like scoring to rank memories against a query string.
 * Used to select the most relevant memories to include in the system prompt
 * (beyond just the index).
 */

import type { MemoryRecord } from './cross-session-store.js';

/** Tokenize text into lowercase words, stripping punctuation. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Compute a relevance score for a memory against a query.
 *
 * Scoring factors:
 * - Term overlap between query and memory (name, description, body)
 * - Name matches are weighted 3x, description 2x, body 1x
 * - Recency bonus: newer memories get a small boost
 * - Type bonus: "feedback" and "user" types get a slight boost (they're more durable)
 */
export function scoreMemoryRelevance(
  memory: MemoryRecord,
  queryTokens: string[],
  maxAge: number = Date.now(),
): number {
  if (queryTokens.length === 0) return 0;

  const nameTokens = tokenize(memory.name + ' ' + memory.description);
  const bodyTokens = tokenize(memory.body);

  const querySet = new Set(queryTokens);
  let score = 0;

  // Name + description match (weighted higher)
  for (const t of nameTokens) {
    if (querySet.has(t)) score += 3;
  }

  // Body match
  for (const t of bodyTokens) {
    if (querySet.has(t)) score += 1;
  }

  // Normalize by query length so longer queries don't dominate
  score = score / Math.sqrt(queryTokens.length);

  // Recency bonus: memories updated in the last 24h get a small boost
  const ageHours = (maxAge - memory.updatedAt) / (1000 * 60 * 60);
  if (ageHours < 24) score *= 1.2;
  else if (ageHours < 168) score *= 1.1; // 1 week

  // Type bonus: feedback and user are more durable
  if (memory.type === 'feedback' || memory.type === 'user') {
    score *= 1.1;
  }

  return score;
}

/**
 * Select the top-N most relevant memories for a given query.
 *
 * @param memories - All available memories
 * @param query - The query text to match against
 * @param limit - Maximum number of memories to return (default 5)
 * @returns Memories sorted by relevance score (highest first)
 */
export function selectRelevantMemories(
  memories: MemoryRecord[],
  query: string,
  limit: number = 5,
): MemoryRecord[] {
  if (!query.trim() || memories.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return memories.slice(0, limit);

  const scored = memories
    .map((m) => ({
      memory: m,
      score: scoreMemoryRelevance(m, queryTokens),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.memory);
}

/**
 * Format relevant memories as a prompt section with full bodies
 * (beyond just the index line).
 */
export function formatRelevantMemoriesForPrompt(
  memories: MemoryRecord[],
): string {
  if (memories.length === 0) return '';

  const lines = ['## Relevant memories (auto-selected)'];
  lines.push('These memories are most relevant to the current conversation:');
  lines.push('');

  for (const m of memories) {
    const body = m.body.length > 500 ? m.body.slice(0, 500) + '…' : m.body;
    lines.push(`### ${m.name} (${m.type})`);
    lines.push(`_${m.description}_`);
    lines.push(body);
    lines.push('');
  }

  return lines.join('\n').trim();
}
