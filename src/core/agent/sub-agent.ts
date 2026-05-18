/**
 * Sub-agent runtime.
 *
 * `spawnSubAgent` builds a child agent context with:
 *   - fresh history `[system, user]`
 *   - same model as parent unless `config.subagent.model` overrides
 *   - restricted toolset (read-only by default; `tools` arg can widen)
 *   - depth = parent.depth + 1 (capped by `config.subagent.maxDepth`)
 *
 * The parent's registry is used as the source of tool definitions; the
 * sub-agent receives a *filtered* registry view, never an entirely new tool
 * pool. This keeps capability gating consistent.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type { ProviderResponse, ToolDefinition } from '../providers/types.js';
import type {
  RegisteredTool,
  ToolContext,
  ToolRegistry,
  ToolResult,
  ToolRunMode,
  ToolWriteMode,
} from './tool-registry.js';
import { createToolRegistry } from './tool-registry.js';
import { runAgentTurn, type CompletionFn } from './agent-loop.js';
import type { HookConfig } from '../hooks/config.js';
import { runHooks } from '../hooks/runner.js';
import type { SkillRegistry } from '../skills/registry.js';
import { appendReplayEvent } from '../replay/log.js';

const DEFAULT_SUBAGENT_TOOLS = ['read_file', 'glob', 'grep', 'list_dir'];
const DEFAULT_MAX_DEPTH = 1;

export interface SpawnSubAgentOptions {
  /** Prompt the sub-agent should solve. */
  prompt: string;
  /** Tool name allow-list. Defaults to read-only. */
  tools?: string[];
  /** Override the run mode (default: same as parent). */
  mode?: ToolRunMode;
  /** Parent context; the sub-agent inherits projectRoot, config, model, etc. */
  parent: ToolContext;
  /** Provider completion fn, threaded down from the parent. */
  completeFn: CompletionFn;
  /** Parent's tool registry (source of tool implementations). */
  parentRegistry: ToolRegistry;
  /** System prompt the sub-agent should run with. */
  systemPrompt: string;
  /** Optional cap on iterations inside the sub-agent. */
  maxIterations?: number;
  /** Hook config inherited from the parent (so child tool calls fire hooks). */
  hooks?: HookConfig;
  /** Skill registry inherited from the parent. */
  skills?: SkillRegistry;
}

export interface SubAgentResult {
  content: string;
  iterations: number;
  isError?: boolean;
}

export async function spawnSubAgent(
  opts: SpawnSubAgentOptions,
): Promise<SubAgentResult> {
  const cfg = opts.parent.config as {
    subagent?: { maxDepth?: number; maxIterations?: number };
  };
  const maxDepth = cfg.subagent?.maxDepth ?? DEFAULT_MAX_DEPTH;

  if ((opts.parent.depth ?? 0) >= maxDepth) {
    return {
      content: `Sub-agent refused: depth ${opts.parent.depth} would exceed maxDepth ${maxDepth}.`,
      iterations: 0,
      isError: true,
    };
  }

  const allowedToolNames = new Set(opts.tools ?? DEFAULT_SUBAGENT_TOOLS);
  const childRegistry = filterRegistry(opts.parentRegistry, allowedToolNames);

  const childAgentId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Replay the spawn event so post-mortems can see parent → child relationships.
  appendReplayEvent(opts.parent.projectRoot, 'subagent_spawn', {
    agentId: childAgentId,
    parentAgentId: opts.parent.agentId,
    depth: (opts.parent.depth ?? 0) + 1,
    tools: [...allowedToolNames],
    promptPreview: opts.prompt.slice(0, 200),
  });
  if (opts.hooks) {
    runHooks(
      'on_subagent_spawn',
      {
        event: 'on_subagent_spawn',
        projectRoot: opts.parent.projectRoot,
        agentId: childAgentId,
        parentAgentId: opts.parent.agentId,
        depth: (opts.parent.depth ?? 0) + 1,
        tools: [...allowedToolNames],
        promptPreview: opts.prompt.slice(0, 200),
      },
      opts.parent.projectRoot,
      { config: opts.hooks },
    );
  }

  const result = await runAgentTurn([], opts.prompt, {
    projectRoot: opts.parent.projectRoot,
    config: opts.parent.config,
    registry: childRegistry,
    completeFn: opts.completeFn,
    systemPrompt: opts.systemPrompt,
    writeMode: opts.parent.writeMode,
    mode: opts.mode ?? opts.parent.mode,
    agentId: childAgentId,
    parentAgentId: opts.parent.agentId,
    depth: (opts.parent.depth ?? 0) + 1,
    maxIterations: opts.maxIterations ?? cfg.subagent?.maxIterations,
    abortSignal: opts.parent.abortSignal,
    // Thread skills + hooks so the child sees the same observability and
    // skill widening as the parent.
    skills: opts.skills ?? opts.parent.skills,
    hooks: opts.hooks,
  });

  return {
    content: result.finalContent,
    iterations: result.iterations,
    isError: result.stopReason === 'iteration_cap' && !result.finalContent,
  };
}

function filterRegistry(
  parent: ToolRegistry,
  allowed: Set<string>,
): ToolRegistry {
  const filtered = createToolRegistry();
  for (const def of parent.list()) {
    if (!allowed.has(def.function.name)) continue;
    const tool = parent.get(def.function.name);
    if (!tool) continue;
    filtered.register(tool);
  }
  return filtered;
}

/** Internal helper used by tests to inspect default tool surface. */
export const _internals = {
  defaultTools: DEFAULT_SUBAGENT_TOOLS,
};

// Re-export RegisteredTool/ProviderResponse so test code can import from one
// place without reaching into tool-registry/providers directly.
export type { RegisteredTool, ToolResult, ProviderResponse, ToolDefinition, ChatMessage, ToolWriteMode };
