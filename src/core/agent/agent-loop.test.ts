import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn } from './agent-loop.js';
import { createToolRegistry, type ToolRegistry } from './tool-registry.js';
import { createProviderStub } from '../../test-utils/provider-stub.js';
import type { SparkCLIConfig } from '../../config/schema.js';

let projectRoot: string;
let registry: ToolRegistry;

function baseOpts(overrides: Partial<Parameters<typeof runAgentTurn>[2]> = {}) {
  return {
    projectRoot,
    config: {} as SparkCLIConfig,
    registry,
    completeFn: async () => ({ content: '', stop_reason: 'end_turn' as const }),
    systemPrompt: 'SYSTEM',
    writeMode: 'staging' as const,
    mode: 'normal' as const,
    agentId: 'a1',
    ...overrides,
  };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-loop-'));
  registry = createToolRegistry();
});

describe('runAgentTurn', () => {
  it('returns text-only response without tool dispatch', async () => {
    const stub = createProviderStub();
    stub.enqueueText('hello world');

    const result = await runAgentTurn([], 'hi', baseOpts({ completeFn: stub.complete }));

    expect(result.stopReason).toBe('no_tools');
    expect(result.iterations).toBe(1);
    expect(result.finalContent).toBe('hello world');
    expect(result.toolCalls).toEqual([]);

    // System prompt is the first message provided to the model, but stripped
    // from the returned history.
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: 'SYSTEM',
    });
    expect(result.history[0]?.role).toBe('user');
  });

  it('handles a single tool call followed by a text response', async () => {
    registry.register({
      name: 'echo',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async (args) => ({
        content: `echoed:${(args as { msg: string }).msg}`,
      }),
    });

    const stub = createProviderStub();
    stub.enqueueToolCall('echo', { msg: 'ping' }, 'call_1');
    stub.enqueueText('I called echo and got: echoed:ping');

    const result = await runAgentTurn(
      [],
      'use the echo tool',
      baseOpts({ completeFn: stub.complete }),
    );

    expect(result.stopReason).toBe('end_turn');
    expect(result.iterations).toBe(2);
    expect(result.finalContent).toMatch(/echoed:ping/);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.tool).toBe('echo');

    // Second provider call should include the assistant tool_call message and
    // a tool message tagged with the matching tool_call_id.
    const secondCall = stub.calls[1]!;
    const assistantMsg = secondCall.messages.find((m) => m.role === 'assistant');
    const toolMsg = secondCall.messages.find((m) => m.role === 'tool');
    expect(assistantMsg?.role).toBe('assistant');
    expect(assistantMsg && 'tool_calls' in assistantMsg && assistantMsg.tool_calls?.[0]?.id).toBe(
      'call_1',
    );
    expect(toolMsg?.role).toBe('tool');
    expect(toolMsg && 'tool_call_id' in toolMsg && toolMsg.tool_call_id).toBe('call_1');
    expect(toolMsg?.content).toMatch(/echoed:ping/);
  });

  it('handles a chain of tool calls before final text', async () => {
    registry.register({
      name: 't',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async (args) => ({
        content: `t-result:${(args as { n: number }).n}`,
      }),
    });

    const stub = createProviderStub();
    stub.enqueueToolCall('t', { n: 1 }, 'call_a');
    stub.enqueueToolCall('t', { n: 2 }, 'call_b');
    stub.enqueueText('done');

    const result = await runAgentTurn([], 'do two things', baseOpts({ completeFn: stub.complete }));

    expect(result.iterations).toBe(3);
    expect(result.stopReason).toBe('end_turn');
    expect(result.toolCalls.map((c) => c.result.content)).toEqual(['t-result:1', 't-result:2']);
    expect(result.finalContent).toBe('done');
  });

  it('honors max iteration cap and reports iteration_cap', async () => {
    registry.register({
      name: 'loopy',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'loop' }),
    });
    const stub = createProviderStub();
    // Always call the tool — the loop must cap.
    for (let i = 0; i < 10; i++) {
      stub.enqueueToolCall('loopy', {}, `call_${i}`);
    }

    const result = await runAgentTurn(
      [],
      'go',
      baseOpts({ completeFn: stub.complete, maxIterations: 3 }),
    );

    expect(result.stopReason).toBe('iteration_cap');
    expect(result.iterations).toBe(3);
    expect(result.toolCalls).toHaveLength(3);
  });

  it('returns tool error to the model when a tool throws', async () => {
    registry.register({
      name: 'bad',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => {
        throw new Error('tool blew up');
      },
    });
    const stub = createProviderStub();
    stub.enqueueToolCall('bad', {}, 'call_x');
    stub.enqueueText('recovered');

    const result = await runAgentTurn([], 'try', baseOpts({ completeFn: stub.complete }));

    expect(result.stopReason).toBe('end_turn');
    const toolMsg = stub.calls[1]?.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toMatch(/tool blew up/);
    expect(result.finalContent).toBe('recovered');
  });

  it('surfaces malformed tool arguments back to the model as a tool error', async () => {
    registry.register({
      name: 'echo',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'ok' }),
    });
    const stub = createProviderStub();
    // Inject a manual response with broken JSON arguments.
    stub.enqueue({
      content: '',
      stop_reason: 'tool_use',
      tool_calls: [
        {
          id: 'call_bad',
          type: 'function',
          function: { name: 'echo', arguments: '{not valid json' },
        },
      ],
    });
    stub.enqueueText('moved on');

    const result = await runAgentTurn([], 'try malformed', baseOpts({ completeFn: stub.complete }));

    expect(result.stopReason).toBe('end_turn');
    expect(result.toolCalls[0]?.result.isError).toBe(true);
    expect(result.toolCalls[0]?.result.content).toMatch(/JSON/i);
    expect(result.finalContent).toBe('moved on');
  });

  it('aborts immediately when the abort signal is already set', async () => {
    const stub = createProviderStub();
    stub.enqueueText('should not be returned');
    const ac = new AbortController();
    ac.abort();

    const result = await runAgentTurn(
      [],
      'hi',
      baseOpts({ completeFn: stub.complete, abortSignal: ac.signal }),
    );

    expect(result.stopReason).toBe('aborted');
    expect(result.iterations).toBe(0);
    // No provider call was made.
    expect(stub.calls).toHaveLength(0);
  });

  it('tracks last prompt_tokens and sums completion_tokens across iterations', async () => {
    registry.register({
      name: 't',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'ok' }),
    });
    const stub = createProviderStub();
    stub.enqueue({
      content: '',
      stop_reason: 'tool_use',
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 't', arguments: '{}' },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    });
    stub.enqueue({
      content: 'final',
      stop_reason: 'end_turn',
      usage: { prompt_tokens: 20, completion_tokens: 6 },
    });

    const result = await runAgentTurn([], 'go', baseOpts({ completeFn: stub.complete }));

    expect(result.usage?.prompt_tokens).toBe(20);
    expect(result.usage?.completion_tokens).toBe(10);
  });

  it('passes registry tool definitions on every iteration', async () => {
    registry.register({
      name: 'echo',
      description: 'desc',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'ok' }),
    });
    const stub = createProviderStub();
    stub.enqueueText('done');

    await runAgentTurn([], 'go', baseOpts({ completeFn: stub.complete }));

    expect(stub.calls[0]?.tools).toHaveLength(1);
    expect(stub.calls[0]?.tools?.[0]?.function.name).toBe('echo');
    expect(stub.calls[0]?.toolChoice).toBe('auto');
  });

  it('omits tools and toolChoice when registry is empty', async () => {
    const stub = createProviderStub();
    stub.enqueueText('done');

    await runAgentTurn([], 'go', baseOpts({ completeFn: stub.complete }));

    expect(stub.calls[0]?.tools).toBeUndefined();
    expect(stub.calls[0]?.toolChoice).toBeUndefined();
  });

  it('invokes onIteration with assistant text and dispatched tools', async () => {
    registry.register({
      name: 't',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'ok' }),
    });
    const stub = createProviderStub();
    stub.enqueueToolCall('t', {}, 'c1');
    stub.enqueueText('done');

    const events: Array<{
      iter: number;
      hasDispatched: boolean;
      text: string;
    }> = [];

    await runAgentTurn(
      [],
      'go',
      baseOpts({
        completeFn: stub.complete,
        onIteration: (info) =>
          events.push({
            iter: info.iteration,
            hasDispatched: !!info.dispatched,
            text: info.assistantText,
          }),
      }),
    );

    // Iter 1: pre-dispatch, then post-dispatch (two events)
    // Iter 2: final text (one event)
    expect(events).toEqual([
      { iter: 1, hasDispatched: false, text: '' },
      { iter: 1, hasDispatched: true, text: '' },
      { iter: 2, hasDispatched: false, text: 'done' },
    ]);
  });
});
