import { describe, it, expect } from 'vitest';
import { __test } from './anthropic.js';
import type { ChatMessage } from './openai-compatible.js';

const { translateOutgoing, translateIncoming, translateTools } = __test;

describe('anthropic translateOutgoing', () => {
  it('hoists system message to top-level system field', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are SparkCLI.' },
      { role: 'user', content: 'hi' },
    ];
    const out = translateOutgoing(messages);
    expect(out.system).toBe('You are SparkCLI.');
    expect(out.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('translates assistant tool_calls into tool_use content blocks', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'list files' },
      {
        role: 'assistant',
        content: 'I will list the files.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'list_dir', arguments: '{"path":"."}' },
          },
        ],
      },
    ];
    const out = translateOutgoing(messages);
    expect(out.messages).toHaveLength(2);
    const assistant = out.messages[1];
    expect(assistant.role).toBe('assistant');
    expect(Array.isArray(assistant.content)).toBe(true);
    const blocks = assistant.content as Array<Record<string, unknown>>;
    expect(blocks[0]).toMatchObject({ type: 'text', text: 'I will list the files.' });
    expect(blocks[1]).toMatchObject({
      type: 'tool_use',
      id: 'call_1',
      name: 'list_dir',
      input: { path: '.' },
    });
  });

  it('translates role:tool messages into user tool_result blocks', () => {
    const messages: ChatMessage[] = [
      { role: 'tool', content: 'README.md\nsrc/', tool_call_id: 'call_1' },
    ];
    const out = translateOutgoing(messages);
    const m = out.messages[0];
    expect(m.role).toBe('user');
    const blocks = m.content as Array<Record<string, unknown>>;
    expect(blocks[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'call_1',
      content: 'README.md\nsrc/',
    });
  });

  it('coalesces consecutive tool_result blocks into one user message', () => {
    const messages: ChatMessage[] = [
      { role: 'tool', content: 'result-1', tool_call_id: 'a' },
      { role: 'tool', content: 'result-2', tool_call_id: 'b' },
    ];
    const out = translateOutgoing(messages);
    expect(out.messages).toHaveLength(1);
    const blocks = out.messages[0].content as unknown[];
    expect(blocks).toHaveLength(2);
  });

  it('falls back to _raw when tool arguments are not valid JSON', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_x',
            type: 'function',
            function: { name: 'broken', arguments: 'not json' },
          },
        ],
      },
    ];
    const out = translateOutgoing(messages);
    const blocks = out.messages[0].content as Array<Record<string, unknown>>;
    expect(blocks[0]).toMatchObject({
      type: 'tool_use',
      input: { _raw: 'not json' },
    });
  });
});

describe('anthropic translateIncoming', () => {
  it('extracts text-only content with end_turn stop reason', () => {
    const res = translateIncoming({
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 3 },
    });
    expect(res.content).toBe('hello');
    expect(res.tool_calls).toBeUndefined();
    expect(res.stop_reason).toBe('end_turn');
    expect(res.usage).toEqual({ prompt_tokens: 10, completion_tokens: 3 });
  });

  it('converts tool_use blocks into OpenAI-shape tool_calls', () => {
    const res = translateIncoming({
      content: [
        { type: 'text', text: 'reading...' },
        { type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'a.ts' } },
      ],
      stop_reason: 'tool_use',
    });
    expect(res.content).toBe('reading...');
    expect(res.stop_reason).toBe('tool_use');
    expect(res.tool_calls).toEqual([
      {
        id: 'tu_1',
        type: 'function',
        function: { name: 'read_file', arguments: JSON.stringify({ path: 'a.ts' }) },
      },
    ]);
  });

  it('throws on completely empty response', () => {
    expect(() => translateIncoming({ content: [] })).toThrow();
  });
});

describe('anthropic round-trip', () => {
  it('preserves tool_calls through outgoing → synthetic anthropic → incoming', () => {
    // Outgoing: assistant emitted a tool_call previously
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'do it' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"x.ts"}' },
          },
        ],
      },
      { role: 'tool', content: 'file contents', tool_call_id: 'c1' },
    ];
    const outgoing = translateOutgoing(messages);
    expect(outgoing.system).toBe('sys');
    expect(outgoing.messages).toHaveLength(3);
    expect(outgoing.messages[2].role).toBe('user');

    // Now simulate Anthropic responding with another tool_use
    const incoming = translateIncoming({
      content: [{ type: 'tool_use', id: 'c2', name: 'list_dir', input: {} }],
      stop_reason: 'tool_use',
    });
    expect(incoming.tool_calls?.[0].function.name).toBe('list_dir');
    expect(incoming.stop_reason).toBe('tool_use');
  });
});

describe('anthropic translateTools', () => {
  it('maps OpenAI tool definitions to Anthropic input_schema', () => {
    const tools = translateTools([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ]);
    expect(tools[0]).toEqual({
      name: 'read_file',
      description: 'Read a file',
      input_schema: { type: 'object', properties: { path: { type: 'string' } } },
    });
  });
});
