import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatchToolCalls } from './tool-dispatcher.js';
import {
  createToolRegistry,
  type ToolContext,
  type ToolRegistry,
} from './tool-registry.js';
import type { ToolCall } from '../providers/types.js';
import type { SparkCLIConfig } from '../../config/schema.js';
import type { HookConfig } from '../hooks/config.js';

let projectRoot: string;
let registry: ToolRegistry;

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot,
    config: {} as SparkCLIConfig,
    writeMode: 'staging',
    mode: 'normal',
    agentId: 'a1',
    depth: 0,
    ...overrides,
  };
}

function makeCall(
  name: string,
  args: Record<string, unknown> = {},
  id = `c_${Math.random().toString(36).slice(2, 8)}`,
): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-dispatcher-'));
  registry = createToolRegistry();
});

describe('dispatchToolCalls', () => {
  it('runs a single tool call and returns its result', async () => {
    registry.register({
      name: 'echo',
      description: 'echo input',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async (args) => ({ content: `got:${JSON.stringify(args)}` }),
    });
    const out = await dispatchToolCalls(
      [makeCall('echo', { x: 1 })],
      registry,
      ctx(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.tool).toBe('echo');
    expect(out[0]?.result.content).toBe('got:{"x":1}');
    expect(out[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('dispatches multiple non-bash tools in parallel', async () => {
    const order: string[] = [];
    const release: Array<() => void> = [];
    function makeBlocking(name: string): Promise<void> {
      return new Promise((resolve) => {
        release.push(() => {
          order.push(name);
          resolve();
        });
      });
    }
    registry.register({
      name: 'a',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => {
        const p = makeBlocking('a');
        await p;
        return { content: 'a-done' };
      },
    });
    registry.register({
      name: 'b',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => {
        const p = makeBlocking('b');
        await p;
        return { content: 'b-done' };
      },
    });

    const dispatched = dispatchToolCalls(
      [makeCall('a'), makeCall('b')],
      registry,
      ctx(),
    );

    // Both handlers should be in-flight before either resolves.
    // Tick the microtask queue until both blockers register.
    while (release.length < 2) await new Promise((r) => setImmediate(r));

    // Resolve b first to prove ordering is parallel, not serial.
    release[1]!();
    release[0]!();

    const out = await dispatched;
    expect(out.map((d) => d.tool)).toEqual(['a', 'b']);
    expect(out.map((d) => d.result.content)).toEqual(['a-done', 'b-done']);
    expect(order).toEqual(['b', 'a']);
  });

  it('serializes bash calls within a batch', async () => {
    const events: string[] = [];
    registry.register({
      name: 'bash',
      description: 'shell',
      parameters: { type: 'object', properties: {} },
      mutates: true,
      handler: async (args) => {
        const tag = String(args.tag);
        events.push(`start:${tag}`);
        await new Promise((r) => setTimeout(r, 20));
        events.push(`end:${tag}`);
        return { content: tag };
      },
    });
    const out = await dispatchToolCalls(
      [
        makeCall('bash', { tag: 'one' }),
        makeCall('bash', { tag: 'two' }),
        makeCall('bash', { tag: 'three' }),
      ],
      registry,
      ctx({ writeMode: 'direct' }),
    );
    expect(out).toHaveLength(3);
    // No interleaving: every "start" is followed by its matching "end" before
    // the next "start".
    expect(events).toEqual([
      'start:one',
      'end:one',
      'start:two',
      'end:two',
      'start:three',
      'end:three',
    ]);
  });

  it('returns synthetic error for already-aborted calls', async () => {
    registry.register({
      name: 'echo',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'should not run' }),
    });
    const ac = new AbortController();
    ac.abort();
    const out = await dispatchToolCalls(
      [makeCall('echo')],
      registry,
      ctx(),
      { abortSignal: ac.signal },
    );
    expect(out[0]?.result.isError).toBe(true);
    expect(out[0]?.result.content).toMatch(/cancel/i);
  });

  it('captures handler exceptions as tool errors (does not throw)', async () => {
    registry.register({
      name: 'boom',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => {
        throw new Error('kaboom');
      },
    });
    const out = await dispatchToolCalls(
      [makeCall('boom')],
      registry,
      ctx(),
    );
    expect(out[0]?.result.isError).toBe(true);
    expect(out[0]?.result.content).toMatch(/kaboom/);
  });

  it('writes a tool_call replay event per dispatch', async () => {
    registry.register({
      name: 'noop',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'ok' }),
    });
    await dispatchToolCalls(
      [makeCall('noop', { a: 1 }), makeCall('noop', { a: 2 })],
      registry,
      ctx({ agentId: 'agent-X' }),
    );
    const logPath = join(projectRoot, '.spark-cli/replay-log.jsonl');
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const events = lines.map((l) => JSON.parse(l));
    for (const ev of events) {
      expect(ev.type).toBe('tool_call');
      expect(ev.data.tool).toBe('noop');
      expect(ev.data.agentId).toBe('agent-X');
      expect(typeof ev.data.durationMs).toBe('number');
      expect(ev.data.result.content).toBe('ok');
    }
  });

  it('truncates long tool output in the replay log only', async () => {
    const huge = 'x'.repeat(20_000);
    registry.register({
      name: 'big',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: huge }),
    });
    const out = await dispatchToolCalls(
      [makeCall('big')],
      registry,
      ctx(),
    );
    // Live history keeps the full content.
    expect(out[0]?.result.content).toBe(huge);

    const log = readFileSync(
      join(projectRoot, '.spark-cli/replay-log.jsonl'),
      'utf8',
    ).trim();
    const ev = JSON.parse(log);
    expect(ev.data.result.truncated).toBe(true);
    expect(ev.data.result.content.length).toBeLessThan(huge.length);
    expect(ev.data.result.content).toMatch(/truncated/);
  });

  it('blocks dispatch when pre_tool hook denies', async () => {
    registry.register({
      name: 'echo',
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: async () => ({ content: 'should not run' }),
    });
    // Inline node script as a hook that exits non-zero.
    const hookPath = join(projectRoot, 'block.js');
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(
      hookPath,
      `process.stderr.write('forbidden'); process.exit(1);`,
      'utf8',
    );
    const hooks: HookConfig = {
      hooks: [
        {
          event: 'pre_tool',
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    };
    const out = await dispatchToolCalls(
      [makeCall('echo')],
      registry,
      ctx(),
      { hooks },
    );
    expect(out[0]?.result.isError).toBe(true);
    expect(out[0]?.result.content).toMatch(/Blocked by pre_tool/);
  });
});
