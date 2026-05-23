import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Mock the cross-session memory dir to use a temp directory
const TMP_MEM_DIR = join(process.cwd(), '.tmp-auto-extract-mem');
vi.mock('../../config/paths.js', () => ({
  getCrossSessionMemoryDir: () => TMP_MEM_DIR,
  getProjectSlug: () => 'test-slug',
}));

// Import after mock setup
const { extractMemoryFacts } = await import('./auto-extract.js');
const { listMemories } = await import('./cross-session-store.js');

const TMP_ROOT = join(process.cwd(), '.tmp-auto-extract-test');

beforeEach(() => {
  mkdirSync(TMP_ROOT, { recursive: true });
  mkdirSync(TMP_MEM_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    rmSync(TMP_MEM_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('extractMemoryFacts', () => {
  it('returns empty when no facts extracted', async () => {
    const completeFn = vi.fn().mockResolvedValue({ content: '[]' });
    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'Hello' }],
      completeFn,
    );
    expect(result).toEqual([]);
  });

  it('extracts and saves facts from LLM response', async () => {
    const facts = [
      {
        name: 'user_prefers_typescript',
        description: 'User prefers TypeScript over JavaScript',
        type: 'user',
        body: 'The user explicitly stated they prefer TypeScript for all new code.',
      },
    ];
    const completeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify(facts),
    });

    const result = await extractMemoryFacts(
      TMP_ROOT,
      [
        { role: 'user', content: 'I prefer TypeScript for this project' },
        { role: 'assistant', content: 'Got it, I will use TypeScript.' },
      ],
      completeFn,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('user_prefers_typescript');
    expect(result[0]!.type).toBe('user');

    // Verify it was saved to disk
    const memories = listMemories(TMP_ROOT);
    expect(memories.length).toBeGreaterThanOrEqual(1);
    const found = memories.find((m) => m.name === 'user_prefers_typescript');
    expect(found).toBeDefined();
    expect(found!.type).toBe('user');
  });

  it('skips duplicate names', async () => {
    const facts = [
      {
        name: 'duplicate_fact',
        description: 'A fact',
        type: 'project',
        body: 'Some fact.',
      },
    ];
    const completeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify(facts),
    });

    // Save first time
    await extractMemoryFacts(TMP_ROOT, [{ role: 'user', content: 'test' }], completeFn);

    // Try to save again — should be skipped
    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'test again' }],
      completeFn,
    );

    expect(result).toHaveLength(0);
  });

  it('handles LLM returning facts in code block', async () => {
    const facts = [
      {
        name: 'code_block_fact',
        description: 'Fact from code block',
        type: 'feedback',
        body: 'User corrected approach.',
      },
    ];
    const completeFn = vi.fn().mockResolvedValue({
      content: '```json\n' + JSON.stringify(facts) + '\n```',
    });

    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'test' }],
      completeFn,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('code_block_fact');
  });

  it('handles LLM errors gracefully', async () => {
    const completeFn = vi.fn().mockRejectedValue(new Error('API error'));
    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'test' }],
      completeFn,
    );
    expect(result).toEqual([]);
  });

  it('handles invalid JSON gracefully', async () => {
    const completeFn = vi.fn().mockResolvedValue({
      content: 'This is not JSON at all.',
    });
    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'test' }],
      completeFn,
    );
    expect(result).toEqual([]);
  });

  it('caps at MAX_FACTS_PER_TURN', async () => {
    const facts = Array.from({ length: 10 }, (_, i) => ({
      name: `fact_${i}`,
      description: `Fact ${i}`,
      type: 'project',
      body: `Body ${i}.`,
    }));
    const completeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify(facts),
    });

    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'test' }],
      completeFn,
    );

    expect(result).toHaveLength(3); // MAX_FACTS_PER_TURN = 3
  });

  it('validates fact fields', async () => {
    const facts = [
      { name: '', description: 'no name', type: 'user', body: 'body' },
      { name: 'no_desc', description: '', type: 'user', body: 'body' },
      { name: 'no_body', description: 'desc', type: 'user', body: '' },
      { name: 'valid', description: 'valid', type: 'user', body: 'valid body' },
    ];
    const completeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify(facts),
    });

    const result = await extractMemoryFacts(
      TMP_ROOT,
      [{ role: 'user', content: 'test' }],
      completeFn,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('valid');
  });
});
