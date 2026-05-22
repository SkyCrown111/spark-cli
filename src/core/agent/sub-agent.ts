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

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
import { completeChat, resolveModelForTask } from '../providers/router.js';
import { resolveOutputMaxTokens } from '../../config/output-tokens.js';
import { getProjectSparkDir } from '../../config/paths.js';

const DEFAULT_SUBAGENT_TOOLS = ['read_file', 'glob', 'grep', 'list_dir', 'load_skill', 'remember', 'recall'];
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
  /**
   * Context mode for the sub-agent:
   * - `fresh` (default): starts with empty history (only system prompt + user)
   * - `fork`: inherits a copy of the parent's conversation history
   */
  contextMode?: 'fresh' | 'fork';
  /** Parent's conversation history (required for fork mode). */
  parentHistory?: ChatMessage[];
  /**
   * Worktree isolation: if true, creates a git worktree under
   * `.spark-cli/worktrees/sub-<id>` so the sub-agent's file mutations
   * are isolated from the parent's working tree.
   */
  useWorktree?: boolean;
  /**
   * Optional memory namespace for the sub-agent. When set, `remember` keys
   * are prefixed with `<namespace>/` so sub-agent memories don't collide
   * with the parent agent's memories.
   */
  memoryNamespace?: string;
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
    subagent?: { maxDepth?: number; maxIterations?: number; model?: string };
  };
  const maxDepth = cfg.subagent?.maxDepth ?? DEFAULT_MAX_DEPTH;

  if ((opts.parent.depth ?? 0) >= maxDepth) {
    return {
      content: `Sub-agent refused: depth ${opts.parent.depth} would exceed maxDepth ${maxDepth}.`,
      iterations: 0,
      isError: true,
    };
  }

  const subModelRaw = cfg.subagent?.model?.trim();
  let childCompleteFn: CompletionFn = opts.completeFn;
  if (subModelRaw) {
    let resolvedSub;
    try {
      const slash = subModelRaw.indexOf('/');
      resolvedSub =
        slash >= 0
          ? resolveModelForTask(opts.parent.config, 'chat', {
              provider: subModelRaw.slice(0, slash).trim(),
              model: subModelRaw.slice(slash + 1).trim(),
            })
          : resolveModelForTask(opts.parent.config, 'chat', { model: subModelRaw });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: `Sub-agent refused: invalid subagent.model "${subModelRaw}" — ${msg}`,
        iterations: 0,
        isError: true,
      };
    }
    const maxTok = resolveOutputMaxTokens(opts.parent.config);
    childCompleteFn = async (messages, options) =>
      completeChat(resolvedSub, messages, {
        maxTokens: options.maxTokens ?? maxTok,
        tools: options.tools,
        toolChoice: options.toolChoice,
        config: opts.parent.config,
        onDelta: options.onDelta,
      });
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

  // Worktree isolation: create a git worktree so the sub-agent's mutations
  // are sandboxed. The worktree is created under .spark-cli/worktrees/sub-<id>.
  let effectiveProjectRoot = opts.parent.projectRoot;
  let worktreePath: string | undefined;
  if (opts.useWorktree) {
    worktreePath = join(getProjectSparkDir(opts.parent.projectRoot), 'worktrees', childAgentId);
    mkdirSync(worktreePath, { recursive: true });
    try {
      const branchName = `spark-cli/sub-${childAgentId}`;
      execSync(
        `git worktree add -b ${branchName} "${worktreePath}" HEAD`,
        { cwd: opts.parent.projectRoot, stdio: 'ignore' },
      );
      effectiveProjectRoot = worktreePath;
      appendReplayEvent(opts.parent.projectRoot, 'subagent_worktree_created', {
        agentId: childAgentId,
        worktreePath,
        branch: branchName,
      });
    } catch (e) {
      // Worktree creation failed (e.g., not a git repo). Fall back to parent root.
      const msg = e instanceof Error ? e.message : String(e);
      appendReplayEvent(opts.parent.projectRoot, 'subagent_worktree_failed', {
        agentId: childAgentId,
        error: msg,
      });
      worktreePath = undefined;
    }
  }

  // Build initial history based on context mode
  const initialHistory: ChatMessage[] =
    opts.contextMode === 'fork' && opts.parentHistory
      ? [...opts.parentHistory] // shallow copy to avoid mutating parent
      : [];

  const result = await runAgentTurn(initialHistory, opts.prompt, {
    projectRoot: effectiveProjectRoot,
    config: opts.parent.config,
    registry: childRegistry,
    completeFn: childCompleteFn,
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
    memoryNamespace: opts.memoryNamespace ?? (childAgentId),
  });

  // Clean up worktree if one was created
  if (worktreePath) {
    try {
      execSync(`git worktree remove --force "${worktreePath}"`, {
        cwd: opts.parent.projectRoot,
        stdio: 'ignore',
      });
      appendReplayEvent(opts.parent.projectRoot, 'subagent_worktree_removed', {
        agentId: childAgentId,
        worktreePath,
      });
    } catch {
      // Best-effort cleanup; worktree may remain on disk
    }
  }

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
