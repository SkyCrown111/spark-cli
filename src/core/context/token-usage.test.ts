import { describe, it, expect } from 'vitest';
import {
  buildTokenUsageSnapshot,
  resolveContextUsageSnapshot,
} from './token-usage.js';
import { DEEPSEEK_V4_CONTEXT_BUDGET } from '../providers/model-context.js';

describe('token-usage', () => {
  it('uses last API prompt_tokens for context fill', () => {
    const snap = resolveContextUsageSnapshot(
      [{ role: 'user', content: 'hello' }],
      1_000_000,
      { prompt_tokens: 42_000, completion_tokens: 800 },
    );
    expect(snap.used).toBe(42_000);
    expect(snap.budget).toBe(1_000_000);
  });

  it('falls back to history estimate when API omits usage', () => {
    const snap = resolveContextUsageSnapshot(
      [{ role: 'user', content: 'abcd' }],
      32_000,
      undefined,
    );
    expect(snap.used).toBeGreaterThan(0);
  });

  it('infers 1M budget for deepseek-v4-flash', () => {
    const snap = buildTokenUsageSnapshot(
      { context: { maxTokens: 32000 } },
      {
        providerId: 'baidu',
        model: 'deepseek-v4-flash',
        apiKey: 'x',
        baseUrl: 'https://example.com/v1',
      },
      [],
    );
    expect(snap.budget).toBe(DEEPSEEK_V4_CONTEXT_BUDGET);
    expect(snap.used).toBe(0);
  });
});
