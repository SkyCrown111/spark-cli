import { describe, it, expect } from 'vitest';
import { resolveContextBudget } from './model-context.js';

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
