import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _handleSlashImpl,
  buildShellRegistry,
  processReplUserLine,
  freshStateForTest,
} from './shell.js';
import type { GlobalOptions } from '../utils/output.js';

const runAgentTurnForCliMock = vi.fn();

vi.mock('../core/agent/run-turn.js', () => ({
  runAgentTurnForCli: (...args: unknown[]) => runAgentTurnForCliMock(...args),
  resolveCompletionFn: vi.fn(),
}));

let projectRoot: string;
let registry: ReturnType<typeof buildShellRegistry>;

function opts(): GlobalOptions {
  return { project: projectRoot };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-repl-e2e-'));
  registry = buildShellRegistry(projectRoot);
  runAgentTurnForCliMock.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('REPL e2e (mocked agent)', () => {
  it('/gen expands to an agent task prompt', async () => {
    const r = await _handleSlashImpl('/gen component PlayerMove', opts(), freshStateForTest(), registry);
    expect(r.handled).toBe(true);
    expect(r.syntheticPrompt?.text).toContain('Generate game code');
    expect(r.syntheticPrompt?.text).toContain('PlayerMove');
  });

  it('processReplUserLine runs agent loop for plain text', async () => {
    runAgentTurnForCliMock.mockResolvedValueOnce({
      finalContent: 'ok',
      stopReason: 'end_turn',
      iterations: 1,
      history: [{ role: 'assistant', content: 'ok' }],
      toolCalls: [],
      model: 'test/mock',
    });

    const state = freshStateForTest();
    const r = await processReplUserLine('hello world', opts(), state, registry);

    expect(r.ranAgent).toBe(true);
    expect(runAgentTurnForCliMock).toHaveBeenCalledTimes(1);
    const call = runAgentTurnForCliMock.mock.calls[0]![0] as { userInput: string };
    expect(call.userInput).toBe('hello world');
    expect(r.state.history.length).toBeGreaterThan(0);
  });

  it('processReplUserLine chains /gen into agent', async () => {
    runAgentTurnForCliMock.mockResolvedValueOnce({
      finalContent: 'staged',
      stopReason: 'end_turn',
      iterations: 1,
      history: [],
      toolCalls: [],
      model: 'test/mock',
    });

    const state = freshStateForTest();
    await processReplUserLine('/gen enemy spawner', opts(), state, registry);

    const call = runAgentTurnForCliMock.mock.calls[0]![0] as { userInput: string };
    expect(call.userInput).toContain('enemy spawner');
    expect(call.userInput).toContain('Generate game code');
  });
});
