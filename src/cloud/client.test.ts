import { describe, it, expect, beforeEach, vi } from 'vitest';

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('undici', () => ({ request: requestMock }));

import { cloudProxyChat } from './client.js';

function ok(json: unknown): {
  statusCode: number;
  body: { text: () => Promise<string> };
} {
  return {
    statusCode: 200,
    body: { text: async () => JSON.stringify(json) },
  };
}

beforeEach(() => {
  requestMock.mockReset();
});

describe('cloudProxyChat schema parity', () => {
  it('forwards tools, tool_choice, and tool_calls/tool messages', async () => {
    requestMock.mockResolvedValueOnce(
      ok({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'c1',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 1 },
      }),
    );

    const res = await cloudProxyChat({
      providerId: 'openai',
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'list files' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'prev',
              type: 'function',
              function: { name: 'list_dir', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: 'a.ts', tool_call_id: 'prev' },
      ],
      tools: [
        { type: 'function', function: { name: 'read_file', parameters: {} } },
      ],
      toolChoice: 'auto',
      token: 'tkn',
    });

    const body = JSON.parse(requestMock.mock.calls[0][1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe('auto');
    expect(body.messages[1].tool_calls?.[0].id).toBe('prev');
    expect(body.messages[2]).toEqual({
      role: 'tool',
      content: 'a.ts',
      tool_call_id: 'prev',
    });

    expect(res.content).toBe('');
    expect(res.tool_calls?.[0].function.name).toBe('read_file');
    expect(res.stop_reason).toBe('tool_use');
    expect(res.usage).toEqual({ prompt_tokens: 4, completion_tokens: 1 });
  });

  it('omits tools field when not provided', async () => {
    requestMock.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    );
    await cloudProxyChat({
      providerId: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'q' }],
      token: 'tkn',
    });
    const body = JSON.parse(requestMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });
});
