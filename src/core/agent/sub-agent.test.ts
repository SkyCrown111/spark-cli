import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSubAgent } from './sub-agent.js';
import { createToolRegistry, type ToolContext, type ToolRegistry } from './tool-registry.js';
import type { SparkCLIConfig } from '../../config/schema.js';
import type { ProviderResponse } from '../providers/types.js';
import type { ChatMessage } from '../providers/openai-compatible.js';
import type { CompletionFn } from './agent-loop.js';

let projectRoot: string;
let parentRegistry: ToolRegistry;

function makeConfig(extras: Partial<SparkCLIConfig> = {}): SparkCLIConfig {
  return { ...extras } as SparkCLIConfig;
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot,
    config: makeConfig(),
    writeMode: 'staging',
    mode: 'normal',
    agentId: 'parent',
    depth: 0,
    skillAllowedTools: new Set<string>(),
    ...overrides,
  };
}

function scriptedCompletion(scripts: ProviderResponse[]): CompletionFn {
  let i = 0;
  return async (_messages: ChatMessage[]) => {
    const r = scripts[i] ?? scripts[scripts.length - 1];
    i += 1;
    return r as ProviderResponse;
  };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-subagent-'));
  parentRegistry = createToolRegistry();
  const stub = async () => ({ content: '' });
  parentRegistry.register({
    name: 'read_file',
    description: '',
    parameters: { type: 'object', properties: {} },
    planModeAllowed: true,
    handler: async () => ({ content: 'parent-read' }),
  });
  parentRegistry.register({
    name: 'write_file',
    description: '',
    parameters: { type: 'object', properties: {} },
    mutates: true,
    handler: async () => ({ content: 'wrote' }),
  });
  for (const name of ['glob', 'grep', 'list_dir', 'load_skill'] as const) {
    parentRegistry.register({
      name,
      description: '',
      parameters: { type: 'object', properties: {} },
      planModeAllowed: true,
      handler: stub,
    });
  }
});

describe('spawnSubAgent', () => {
  it('runs an isolated agent and returns its final content', async () => {
    const result = await spawnSubAgent({
      prompt: 'summarize this',
      parent: ctx(),
      parentRegistry,
      systemPrompt: 'sub system',
      completeFn: scriptedCompletion([
        {
          content: 'sub-final',
          stop_reason: 'end_turn',
          usage: {},
        } as unknown as ProviderResponse,
      ]),
    });
    expect(result.content).toBe('sub-final');
    expect(result.iterations).toBe(1);
    expect(result.isError).toBeFalsy();
  });

  it('refuses when depth would exceed maxDepth', async () => {
    const r = await spawnSubAgent({
      prompt: 'noop',
      parent: ctx({ depth: 1 }),
      parentRegistry,
      systemPrompt: 's',
      completeFn: scriptedCompletion([
        { content: 'x', stop_reason: 'end_turn' } as ProviderResponse,
      ]),
    });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/maxDepth/);
  });

  it('honors custom maxDepth from config', async () => {
    const c = ctx({
      depth: 1,
      config: makeConfig({
        subagent: { maxDepth: 2 },
      } as Partial<SparkCLIConfig>),
    });
    const r = await spawnSubAgent({
      prompt: 'p',
      parent: c,
      parentRegistry,
      systemPrompt: 's',
      completeFn: scriptedCompletion([
        { content: 'ok', stop_reason: 'end_turn' } as ProviderResponse,
      ]),
    });
    expect(r.content).toBe('ok');
    expect(r.isError).toBeFalsy();
  });

  it('restricts toolset to the requested whitelist', async () => {
    let observedTools: string[] = [];
    const completeFn: CompletionFn = async (_msgs, options) => {
      observedTools = (options.tools ?? []).map((t) => t.function.name);
      return { content: 'done', stop_reason: 'end_turn' } as ProviderResponse;
    };
    await spawnSubAgent({
      prompt: 'find references',
      tools: ['read_file'],
      parent: ctx(),
      parentRegistry,
      systemPrompt: 's',
      completeFn,
    });
    expect(observedTools).toEqual(['read_file']);
    expect(observedTools).not.toContain('write_file');
  });

  it('refuses when subagent.model cannot be resolved', async () => {
    const r = await spawnSubAgent({
      prompt: 'p',
      parent: ctx({
        config: makeConfig({
          subagent: { model: 'missing-provider/unknown-model-xyz' },
        } as Partial<SparkCLIConfig>),
      }),
      parentRegistry,
      systemPrompt: 's',
      completeFn: scriptedCompletion([
        { content: 'x', stop_reason: 'end_turn' } as ProviderResponse,
      ]),
    });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/subagent\.model/);
    expect(r.iterations).toBe(0);
  });

  it('defaults to read-only tools when none specified', async () => {
    let observedTools: string[] = [];
    const completeFn: CompletionFn = async (_msgs, options) => {
      observedTools = (options.tools ?? []).map((t) => t.function.name);
      return { content: 'done', stop_reason: 'end_turn' } as ProviderResponse;
    };
    await spawnSubAgent({
      prompt: 'p',
      parent: ctx(),
      parentRegistry,
      systemPrompt: 's',
      completeFn,
    });
    expect(observedTools.sort()).toEqual(
      ['glob', 'grep', 'list_dir', 'load_skill', 'read_file'].sort(),
    );
    expect(observedTools).not.toContain('write_file');
  });
});
