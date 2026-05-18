import { describe, expect, it } from 'vitest';
import { buildKnowledgeIndex, getBuiltinKnowledgeDir } from './indexer.js';
import { searchKnowledge } from './retriever.js';

describe('knowledge retriever', () => {
  it('finds wechat-related content', () => {
    const index = buildKnowledgeIndex([getBuiltinKnowledgeDir()]);
    expect(index.chunks.length).toBeGreaterThan(0);
    const hits = searchKnowledge(index, '微信 分包');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.text.toLowerCase()).toMatch(/分包|微信|mb/);
  });
});
