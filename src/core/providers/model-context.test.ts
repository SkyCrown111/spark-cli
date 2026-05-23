import { describe, it, expect } from 'vitest';
import { DEEPSEEK_V4_CONTEXT_BUDGET, resolveContextBudget } from './model-context.js';

describe('resolveContextBudget', () => {
  it('infers a larger context window for MiMo v2.5 models', () => {
    const budget = resolveContextBudget(
      { context: { maxTokens: 32000 } },
      {
        providerId: 'mimo',
        model: 'mimo-v2.5-pro',
        apiKey: 'x',
        baseUrl: 'https://example.com/v1',
      },
    );

    expect(budget).toBe(204800);
  });

  it('infers 1M for DeepSeek V4 when config uses the default budget', () => {
    const budget = resolveContextBudget(
      { context: { maxTokens: 32000 } },
      {
        providerId: 'baidu',
        model: 'deepseek-v4-flash',
        apiKey: 'x',
        baseUrl: 'https://example.com/v1',
      },
    );
    expect(budget).toBe(DEEPSEEK_V4_CONTEXT_BUDGET);
  });

  it('infers 64k for pre-V4 DeepSeek models', () => {
    const budget = resolveContextBudget(
      { context: { maxTokens: 32000 } },
      {
        providerId: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'x',
        baseUrl: 'https://api.deepseek.com/v1',
      },
    );
    expect(budget).toBe(65536);
  });

  it('preserves an explicit non-default configured budget', () => {
    const budget = resolveContextBudget(
      { context: { maxTokens: 65536 } },
      {
        providerId: 'mimo',
        model: 'mimo-v2.5-pro',
        apiKey: 'x',
        baseUrl: 'https://example.com/v1',
      },
    );

    expect(budget).toBe(65536);
  });
});
