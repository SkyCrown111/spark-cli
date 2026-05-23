import { describe, it, expect } from 'vitest';
import { createToolRegistry, type ToolContext } from './tool-registry.js';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot: process.cwd(),
    config: {} as never,
    writeMode: 'staging',
    mode: 'normal',
    agentId: 'a1',
    depth: 0,
    ...overrides,
  };
}

describe('tool registry', () => {
  it('registers and lists tools as OpenAI-shape definitions', () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'noop',
      description: 'no op',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      mutates: false,
      handler: async () => ({ content: 'ok' }),
    });
    const list = reg.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'function',
      function: { name: 'noop', description: 'no op' },
    });
  });

  it('hides non-plan-allowed tools when filter mode is plan', () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'reader',
      description: '',
      parameters: {},
      planModeAllowed: true,
      mutates: false,
      handler: async () => ({ content: '' }),
    });
    reg.register({
      name: 'writer',
      description: '',
      parameters: {},
      planModeAllowed: false,
      mutates: true,
      handler: async () => ({ content: '' }),
    });
    expect(reg.list({ mode: 'plan' }).map((t) => t.function.name)).toEqual(['reader']);
    expect(
      reg
        .list({ mode: 'normal' })
        .map((t) => t.function.name)
        .sort(),
    ).toEqual(['reader', 'writer']);
  });

  it('refuses unknown tool names with isError', async () => {
    const reg = createToolRegistry();
    const r = await reg.dispatch('nope', '{}', makeCtx());
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/not registered/i);
  });

  it('blocks mutating tools in plan mode at dispatch time even if the model called them', async () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'writer',
      description: '',
      parameters: {},
      planModeAllowed: false,
      mutates: true,
      handler: async () => ({ content: 'wrote' }),
    });
    const r = await reg.dispatch('writer', '{}', makeCtx({ mode: 'plan' }));
    expect(r.isError).toBe(true);
    expect(r.content.toLowerCase()).toMatch(/plan mode/);
  });

  it('returns a model-readable error on malformed JSON arguments', async () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'noop',
      description: '',
      parameters: {},
      planModeAllowed: true,
      mutates: false,
      handler: async () => ({ content: 'ok' }),
    });
    const r = await reg.dispatch('noop', '{not json', makeCtx());
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/invalid JSON/i);
  });

  it('catches handler exceptions', async () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'boom',
      description: '',
      parameters: {},
      planModeAllowed: true,
      mutates: false,
      handler: async () => {
        throw new Error('kaboom');
      },
    });
    const r = await reg.dispatch('boom', '{}', makeCtx());
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/kaboom/);
  });

  it('blocks MCP write tool when mcp.allowWrite is false', async () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'scene_add_node',
      description: '',
      parameters: {},
      planModeAllowed: false,
      mutates: true,
      handler: async () => ({ content: 'added' }),
    });
    const r = await reg.dispatch('scene_add_node', '{}', makeCtx());
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/mcp\.allowWrite/);
  });

  it('allows MCP write tool when mcp.allowWrite is true', async () => {
    const reg = createToolRegistry();
    reg.register({
      name: 'scene_add_node',
      description: '',
      parameters: {},
      planModeAllowed: false,
      mutates: true,
      handler: async () => ({ content: 'added' }),
    });
    const r = await reg.dispatch(
      'scene_add_node',
      '{}',
      makeCtx({ config: { mcp: { allowWrite: true } } as never }),
    );
    expect(r.isError).toBeFalsy();
    expect(r.content).toBe('added');
  });
});
