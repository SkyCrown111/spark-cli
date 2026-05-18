import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _resetCapabilitiesForTests, getCapabilities } from './capabilities.js';

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('undici', () => ({ request: requestMock }));

import { chatCompletion } from './openai-compatible.js';

function ok(json: unknown): {
  statusCode: number;
  body: { text: () => Promise<string> };
} {
  return {
    statusCode: 200,
    body: { text: async () => JSON.stringify(json) },
  };
}

function err(status: number, body: string): {
  statusCode: number;
  body: { text: () => Promise<string> };
} {
  return {
    statusCode: status,
    body: { text: async () => body },
  };
}

/**
 * Build an SSE-style mocked response. `frames` is the list of JSON objects
 * (one per `data:` frame); they're concatenated with `\n\n` like a real
 * EventSource stream and emitted as a single Buffer chunk for simplicity.
 */
function sse(frames: unknown[]): {
  statusCode: number;
  body: AsyncIterable<Buffer> & { text: () => Promise<string> };
} {
  const text =
    frames.map((f) => `data: ${JSON.stringify(f)}`).join('\n\n') + '\n\ndata: [DONE]\n\n';
  const buf = Buffer.from(text, 'utf8');
  return {
    statusCode: 200,
    body: Object.assign(
      {
        async *[Symbol.asyncIterator]() {
          // Split into a couple of chunks so the SSE parser exercises its buffer.
          yield buf.slice(0, Math.floor(buf.length / 2));
          yield buf.slice(Math.floor(buf.length / 2));
        },
      },
      { text: async () => text },
    ),
  };
}

beforeEach(() => {
  requestMock.mockReset();
  _resetCapabilitiesForTests();
});

describe('chatCompletion request body', () => {
  it('sends tools and tool_choice when tools provided', async () => {
    requestMock.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }),
    );
    await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
      tools: [
        {
          type: 'function',
          function: { name: 'read_file', parameters: { type: 'object' } },
        },
      ],
    });
    const body = JSON.parse(requestMock.mock.calls[0][1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe('read_file');
    expect(body.tool_choice).toBe('auto');
  });

  it('omits tools when not provided', async () => {
    requestMock.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }),
    );
    await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
    });
    const body = JSON.parse(requestMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('serializes assistant tool_calls and role:tool messages on the wire', async () => {
    requestMock.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
    );
    await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'list_dir', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: 'README.md', tool_call_id: 'c1' },
      ],
    });
    const body = JSON.parse(requestMock.mock.calls[0][1].body);
    expect(body.messages[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'c1', function: { name: 'list_dir' } }],
    });
    expect(body.messages[2]).toEqual({
      role: 'tool',
      content: 'README.md',
      tool_call_id: 'c1',
    });
  });
});

describe('chatCompletion response parsing', () => {
  it('returns tool_calls and stop_reason tool_use', async () => {
    requestMock.mockResolvedValueOnce(
      ok({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'c1',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    );
    const res = await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(res.content).toBe('');
    expect(res.tool_calls).toHaveLength(1);
    expect(res.stop_reason).toBe('tool_use');
    expect(res.usage).toEqual({ prompt_tokens: 5, completion_tokens: 2 });
  });

  it('maps finish_reason length → max_tokens', async () => {
    requestMock.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }] }),
    );
    const res = await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(res.stop_reason).toBe('max_tokens');
  });

  it('throws when both content and tool_calls are empty', async () => {
    requestMock.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }),
    );
    await expect(
      chatCompletion({
        baseUrl: 'https://example.com/v1',
        apiKey: 'key',
        model: 'm',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toThrow();
  });
});

describe('chatCompletion capability demotion', () => {
  it('demotes provider on tool-related 4xx', async () => {
    requestMock.mockResolvedValueOnce(
      err(400, JSON.stringify({ error: { message: 'tools parameter not supported' } })),
    );
    const baseUrl = 'https://example.com/v1';
    const model = 'm';
    await expect(
      chatCompletion({
        baseUrl,
        apiKey: 'key',
        model,
        messages: [{ role: 'user', content: 'q' }],
        providerId: 'mimo',
        tools: [
          { type: 'function', function: { name: 'read_file', parameters: {} } },
        ],
      }),
    ).rejects.toThrow();
    const caps = getCapabilities({ providerId: 'mimo', baseUrl, model });
    expect(caps.tools).toBe(false);
  });

  it('does not demote on non-tool-related 4xx', async () => {
    requestMock.mockResolvedValueOnce(
      err(401, JSON.stringify({ error: { message: 'unauthorized' } })),
    );
    const baseUrl = 'https://example.com/v1';
    const model = 'm';
    await expect(
      chatCompletion({
        baseUrl,
        apiKey: 'key',
        model,
        messages: [{ role: 'user', content: 'q' }],
        providerId: 'mimo',
        tools: [
          { type: 'function', function: { name: 'read_file', parameters: {} } },
        ],
      }),
    ).rejects.toThrow();
    const caps = getCapabilities({ providerId: 'mimo', baseUrl, model });
    expect(caps.tools).toBe(true);
  });
});

describe('chatCompletion streaming', () => {
  it('fires onDelta per chunk and assembles final content', async () => {
    requestMock.mockResolvedValueOnce(
      sse([
        { choices: [{ delta: { content: 'Hel' } }] },
        { choices: [{ delta: { content: 'lo, ' } }] },
        { choices: [{ delta: { content: 'world!' }, finish_reason: 'stop' }] },
      ]),
    );
    const deltas: string[] = [];
    const res = await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
      onDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(['Hel', 'lo, ', 'world!']);
    expect(res.content).toBe('Hello, world!');
    expect(res.stop_reason).toBe('end_turn');
    const body = JSON.parse(requestMock.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it('assembles tool_calls from streamed argument fragments', async () => {
    requestMock.mockResolvedValueOnce(
      sse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'c1',
                    type: 'function',
                    function: { name: 'read_file', arguments: '{"pa' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: 'th":"a.ts"}' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 7, completion_tokens: 4 },
        },
      ]),
    );
    const res = await chatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
      onDelta: () => undefined,
    });
    expect(res.content).toBe('');
    expect(res.tool_calls).toHaveLength(1);
    expect(res.tool_calls?.[0]).toEqual({
      id: 'c1',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
    });
    expect(res.stop_reason).toBe('tool_use');
    expect(res.usage).toEqual({ prompt_tokens: 7, completion_tokens: 4 });
  });

  it('throws when stream produces no content and no tool_calls', async () => {
    requestMock.mockResolvedValueOnce(
      sse([{ choices: [{ delta: {}, finish_reason: 'stop' }] }]),
    );
    await expect(
      chatCompletion({
        baseUrl: 'https://example.com/v1',
        apiKey: 'key',
        model: 'm',
        messages: [{ role: 'user', content: 'q' }],
        onDelta: () => undefined,
      }),
    ).rejects.toThrow();
  });
});
