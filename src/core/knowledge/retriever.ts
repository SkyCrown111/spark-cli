import { tokenize, type KnowledgeChunk, type KnowledgeIndex } from './indexer.js';

export interface SearchHit {
  score: number;
  chunk: KnowledgeChunk;
}

/** Simple BM25-ish keyword scoring (no external deps). */
export function searchKnowledge(
  index: KnowledgeIndex,
  query: string,
  limit = 5,
): SearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const N = index.chunks.length;
  const df = new Map<string, number>();
  for (const chunk of index.chunks) {
    const seen = new Set(chunk.tokens);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const hits: SearchHit[] = [];
  for (const chunk of index.chunks) {
    let score = 0;
    const len = chunk.tokens.length || 1;
    for (const term of terms) {
      const tf = chunk.tokens.filter((t) => t === term).length;
      if (tf === 0) continue;
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      score += (tf / len) * idf;
    }
    if (score > 0) hits.push({ score, chunk });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
