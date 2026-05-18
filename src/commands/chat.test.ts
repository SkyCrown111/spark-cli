import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GlobalOptions } from '../utils/output.js';

const runAgentTurnForCliMock = vi.fn();

vi.mock('../core/agent/run-turn.js', () => ({
  runAgentTurnForCli: (...args: unknown[]) => runAgentTurnForCliMock(...args),
}));

import { runChat } from './chat.js';

const opts: GlobalOptions = {};

beforeEach(() => {
  runAgentTurnForCliMock.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runChat', () => {
  it('routes to agent loop by default', async () => {
    runAgentTurnForCliMock.mockResolvedValueOnce({
      finalContent: 'hi back',
      stopReason: 'end_turn',
      iterations: 1,
      history: [],
      toolCalls: [],
      model: 'openai/gpt-4o',
    });

    await runChat(opts, 'hello');

    expect(runAgentTurnForCliMock).toHaveBeenCalledTimes(1);
    const args = runAgentTurnForCliMock.mock.calls[0]![0] as {
      writeMode: string;
      mode: string;
      userInput: string;
    };
    expect(args.writeMode).toBe('staging');
    expect(args.mode).toBe('normal');
    expect(args.userInput).toBe('hello');
  });

  it('uses direct write mode when --auto is set', async () => {
    runAgentTurnForCliMock.mockResolvedValueOnce({
      finalContent: 'done',
      stopReason: 'end_turn',
      iterations: 1,
      history: [],
      toolCalls: [],
      model: 'openai/gpt-4o',
    });

    await runChat(opts, 'go', { auto: true });
    const args = runAgentTurnForCliMock.mock.calls[0]![0] as { writeMode: string };
    expect(args.writeMode).toBe('direct');
  });

  it('emits JSON output when --json is set', async () => {
    runAgentTurnForCliMock.mockResolvedValueOnce({
      finalContent: 'yes',
      stopReason: 'end_turn',
      iterations: 2,
      history: [],
      toolCalls: [
        {
          tool_call_id: 'c1',
          tool: 'read_file',
          result: { content: 'x', isError: false },
          durationMs: 5,
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
      model: 'openai/gpt-4o',
    });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    });

    await runChat({ ...opts, json: true }, 'hi');

    const jsonLine = logs.find((l) => l.startsWith('{'))!;
    expect(jsonLine).toBeTruthy();
    const payload = JSON.parse(jsonLine);
    expect(payload.model).toBe('openai/gpt-4o');
    expect(payload.stopReason).toBe('end_turn');
    expect(payload.iterations).toBe(2);
    expect(payload.toolCalls[0].tool).toBe('read_file');
    expect(payload.usage.prompt_tokens).toBe(10);
  });
});
