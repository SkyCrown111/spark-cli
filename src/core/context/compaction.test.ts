import { describe, it, expect } from 'vitest';
import { compactHistory, DEFAULT_RECENT_N } from './compaction.js';
import type { ChatMessage } from '../providers/openai-compatible.js';
import type { ProviderResponse } from '../providers/types.js';
import type { CompletionFn } from '../agent/agent-loop.js';

function fixedCompletion(response: ProviderResponse): CompletionFn {
  return async () => response;
}

function userMsg(text: string): ChatMessage {
  return { role: 'user', content: text };
}
function asstMsg(text: string): ChatMessage {
  return { role: 'assistant', content: text };
}

describe('compactHistory', () => {
  it('returns history unchanged if shorter than recentN', async () => {
    const h: ChatMessage[] = [userMsg('a'), asstMsg('b')];
    const out = await compactHistory(h, {
      completeFn: fixedCompletion({
        content: 'unused',
        stop_reason: 'end_turn',
      } as ProviderResponse),
    });
    expect(out.history).toBe(h);
    expect(out.compactedCount).toBe(0);
  });

  it('replaces the prefix with a synthetic summary user message', async () => {
    // 10 messages > recentN(6); 4 should be compacted. We alternate user/asst
    // so the tail starts with a non-tool, non-user message (asst) — the safety
    // adjustments do not kick in here.
    const h: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      h.push(i % 2 === 0 ? userMsg(`u${i}`) : asstMsg(`a${i}`));
    }
    // Tail starts at index 4 (= u4). To avoid the user-fold safety, swap so
    // tail[0] is assistant.
    const swapped: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      swapped.push(i % 2 === 0 ? asstMsg(`a${i}`) : userMsg(`u${i}`));
    }
    const out = await compactHistory(swapped, {
      completeFn: fixedCompletion({
        content: 'PREFIX SUMMARY',
        stop_reason: 'end_turn',
      } as ProviderResponse),
    });

    expect(out.compactedCount).toBe(4);
    expect(out.summary).toBe('PREFIX SUMMARY');
    expect(out.history).toHaveLength(1 + DEFAULT_RECENT_N);
    expect(out.history[0]).toEqual({
      role: 'user',
      content: '[Conversation summary]\nPREFIX SUMMARY',
    });
    // Tail preserved verbatim.
    expect(out.history.slice(1)).toEqual(
      swapped.slice(swapped.length - DEFAULT_RECENT_N),
    );
  });

  it('renders tool calls and tool messages into the transcript', async () => {
    let observedPrompt = '';
    const h: ChatMessage[] = [
      userMsg('investigate the build'),
      {
        role: 'assistant',
        content: 'looking',
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"x"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'file body' },
      asstMsg('done'),
      userMsg('next'),
      asstMsg('next2'),
      userMsg('q1'),
      asstMsg('a1'),
      userMsg('q2'),
      asstMsg('a2'),
    ];
    const completeFn: CompletionFn = async (msgs) => {
      const u = msgs.find((m) => m.role === 'user');
      observedPrompt = typeof u?.content === 'string' ? u.content : '';
      return { content: 'sum', stop_reason: 'end_turn' } as ProviderResponse;
    };
    await compactHistory(h, { completeFn });
    expect(observedPrompt).toContain('read_file');
    expect(observedPrompt).toContain('tool[c1]');
  });

  it('respects custom recentN', async () => {
    const h: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) h.push(userMsg(`m${i}`));
    const out = await compactHistory(h, {
      completeFn: fixedCompletion({
        content: 'S',
        stop_reason: 'end_turn',
      } as ProviderResponse),
      recentN: 3,
    });
    // All entries are 'user'; the user-fold safety folds one extra into the
    // summary so the tail begins after a non-user-collision boundary.
    expect(out.compactedCount).toBe(8);
    expect(out.history).toHaveLength(1 + 2);
  });

  it('extends cut to avoid orphan tool messages at tail head', async () => {
    // Build a conversation whose natural recentN cut would leave a tool
    // message at tail[0] without its assistant call.
    const h: ChatMessage[] = [
      userMsg('start'),
      asstMsg('a1'),
      asstMsg('a2'),
      {
        role: 'assistant',
        content: 'thinking',
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'read_file', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'tool result' },
      asstMsg('a3'),
      asstMsg('a4'),
      asstMsg('a5'),
    ];
    // recentN = 6 ⇒ natural cut at index 2; tail[0] = assistant, fine. We
    // instead force a small recentN to test the orphan-shift logic.
    const out = await compactHistory(h, {
      completeFn: fixedCompletion({
        content: 'S',
        stop_reason: 'end_turn',
      } as ProviderResponse),
      recentN: 4,
    });
    // The first message in the kept tail must NOT be `tool`.
    expect(out.history[1]?.role).not.toBe('tool');
  });

  it('falls back to a placeholder when the model returns empty content', async () => {
    const h: ChatMessage[] = Array.from({ length: 10 }, (_, i) =>
      userMsg(`m${i}`),
    );
    const out = await compactHistory(h, {
      completeFn: fixedCompletion({
        content: '',
        stop_reason: 'end_turn',
      } as ProviderResponse),
    });
    expect(out.summary).toBe('(no summary produced)');
    expect((out.history[0] as { content: string }).content).toContain(
      '(no summary produced)',
    );
  });
});
