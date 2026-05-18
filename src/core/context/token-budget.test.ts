import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  computeBudgetStatus,
} from './token-budget.js';
import type { ChatMessage } from '../providers/openai-compatible.js';

describe('estimateMessageTokens', () => {
  it('counts content chars / 4 plus per-message overhead', () => {
    const m: ChatMessage = { role: 'user', content: 'a'.repeat(40) };
    // 40 / 4 = 10, + overhead 4 = 14
    expect(estimateMessageTokens(m)).toBe(14);
  });

  it('includes assistant tool_calls arguments and ids', () => {
    const m: ChatMessage = {
      role: 'assistant',
      content: 'ok',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
        },
      ],
    };
    // content "ok" = 2; id 6, name 9, args 15 => 32 chars / 4 = 8, + 4 overhead = 12
    expect(estimateMessageTokens(m)).toBe(12);
  });

  it('includes tool_call_id on tool messages', () => {
    const m: ChatMessage = {
      role: 'tool',
      tool_call_id: 'call_xyz',
      content: 'result',
    };
    // 6 + 8 = 14 / 4 = 4 (ceil), + 4 overhead = 8
    expect(estimateMessageTokens(m)).toBe(8);
  });
});

describe('estimateTokens', () => {
  it('sums message estimates', () => {
    const a: ChatMessage = { role: 'user', content: 'aaaa' };
    const b: ChatMessage = { role: 'assistant', content: 'bb' };
    expect(estimateTokens([a, b])).toBe(
      estimateMessageTokens(a) + estimateMessageTokens(b),
    );
  });
});

describe('computeBudgetStatus', () => {
  it('flags overThreshold at 75% by default', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'x'.repeat(1000) },
    ];
    const s = computeBudgetStatus(msgs, 300);
    expect(s.overThreshold).toBe(true);
    expect(s.fraction).toBeGreaterThan(0.75);
  });

  it('respects an override threshold', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: 'short' }];
    const a = computeBudgetStatus(msgs, 1000, { threshold: 0.001 });
    const b = computeBudgetStatus(msgs, 1000, { threshold: 0.99 });
    expect(a.overThreshold).toBe(true);
    expect(b.overThreshold).toBe(false);
  });

  it('uses caller-supplied `used` when provided', () => {
    const s = computeBudgetStatus([], 1000, { used: 800 });
    expect(s.used).toBe(800);
    expect(s.fraction).toBeCloseTo(0.8);
    expect(s.overThreshold).toBe(true);
  });
});
