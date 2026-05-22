/**
 * High-level wrapper used by the REPL and `chat` command.
 */

import type { GlobalOptions } from '../../utils/output.js';
import { resolveProjectRoot } from '../../utils/output.js';
import { loadMergedConfig } from '../../config/load.js';
import { resolveOutputMaxTokens } from '../../config/output-tokens.js';
import { completeChat, resolveModelForTask } from '../providers/router.js';
import { resolveContextBudget } from '../providers/model-context.js';
import type { ChatMessage } from '../providers/openai-compatible.js';
import type { ProviderResponse, ToolDefinition } from '../providers/types.js';
import { buildAgentSystemPrompt } from './system-prompt.js';
import { buildDefaultRegistry } from './tools/index.js';
import {
  runAgentTurn,
  type IterationInfo,
  type RunAgentTurnResult,
} from './agent-loop.js';
import type { ToolRunMode, ToolWriteMode } from './tool-registry.js';
import { loadHookConfig } from '../hooks/config.js';
import { createSkillRegistry } from '../skills/registry.js';
import { loadSkillsFromDisk } from '../skills/loader.js';
import { expandAtReferences } from '../repl/at-refs.js';
import { buildAgentUserMessage } from './vision-user-message.js';
import type { VisualInputContext } from '../vision/visual-context.js';
import type { DispatchedCall } from './tool-dispatcher.js';
import type { CompletionFn } from './agent-loop.js';
import {
  type AskUserFn,
  type ToolConfirmFn,
  type ToolPermissionSession,
} from './tool-permissions.js';
import { connectMcpClients } from '../../mcp/client-pool.js';

export async function resolveCompletionFn(
  globalOpts: GlobalOptions,
  effortLevel?: 'low' | 'medium' | 'high' | 'xhigh' | 'max',
): Promise<{ completeFn: CompletionFn; model: string }> {
  const root = resolveProjectRoot(globalOpts);
  const config = await loadMergedConfig(root);
  const resolved = resolveModelForTask(config, 'chat', {
    provider: globalOpts.provider,
    model: globalOpts.model,
  });
  const maxTokens = resolveOutputMaxTokens(config);
  const completeFn: CompletionFn = async (messages, options) => {
    return completeChat(resolved, messages, {
      maxTokens: options.maxTokens ?? maxTokens,
      tools: options.tools,
      toolChoice: options.toolChoice,
      config,
      onDelta: options.onDelta,
      effortLevel,
    });
  };
  return { completeFn, model: `${resolved.providerId}/${resolved.model}` };
}

export interface RunTurnOptions {
  globalOpts: GlobalOptions;
  history: ChatMessage[];
  userInput: string;
  /** When set (e.g. REPL after @ expansion), used for the agent user message. */
  agentInput?: string;
  writeMode: ToolWriteMode;
  mode: ToolRunMode;
  agentId: string;
  abortSignal?: AbortSignal;
  onIteration?: (info: IterationInfo) => void;
  onDelta?: (delta: string) => void;
  onToolCompleted?: (call: DispatchedCall) => void;
  configOverride?: import('../../config/schema.js').SparkCLIConfig;
  visualContext?: VisualInputContext;
  /** Expand `@path` mentions (default true). */
  expandAtRefs?: boolean;
  toolPermissionSession?: ToolPermissionSession;
  confirmTool?: ToolConfirmFn;
  askUser?: AskUserFn;
  contextBudget?: number;
  /** Maximum agent iterations (overrides config). */
  maxTurns?: number;
  /** Maximum estimated USD spend; aborts when reached. */
  maxBudgetUsd?: number;
  /** Custom system prompt (replaces default). */
  systemPromptOverride?: string;
  /** Append text to default system prompt. */
  appendSystemPrompt?: string;
  /** Reasoning effort level for this turn. */
  effortLevel?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Current permission mode. */
  permissionMode?: import('../../state/AppState.js').PermissionMode;
  /** Tools explicitly denied by CLI --disallowedTools flag. */
  disallowedTools?: Set<string>;
  /** Tools allowed by the active agent definition (restricts to this set). */
  agentAllowedTools?: Set<string>;
}

export interface RunTurnResult extends RunAgentTurnResult {
  model: string;
  /** Paths expanded from `@` mentions this turn. */
  atRefs?: string[];
}

export async function runAgentTurnForCli(
  opts: RunTurnOptions,
): Promise<RunTurnResult> {
  const root = resolveProjectRoot(opts.globalOpts);
  const config = opts.configOverride ?? (await loadMergedConfig(root));
  const llmTask = opts.visualContext?.imageDataUrl ? 'vision' : 'chat';
  const resolved = resolveModelForTask(config, llmTask, {
    provider: opts.globalOpts.provider,
    model: opts.globalOpts.model,
  });

  let agentText = opts.agentInput ?? opts.userInput;
  let atRefs: string[] | undefined;
  if (
    !opts.agentInput &&
    opts.expandAtRefs !== false &&
    !opts.userInput.trimStart().startsWith('/')
  ) {
    const expanded = expandAtReferences(root, opts.userInput);
    agentText = expanded.agentText;
    atRefs = expanded.refs.length > 0 ? expanded.refs : undefined;
  }

  const userMessage = buildAgentUserMessage(agentText, opts.visualContext);

  const registry = buildDefaultRegistry({ projectRoot: root, config });

  // Connect to MCP client servers and register their tools
  // Also loads servers from .mcp.json in project root
  let mcpPool: import('../../mcp/client-pool.js').McpClientPool | undefined;
  try {
    const mcpResult = await connectMcpClients(config, root);
    mcpPool = mcpResult.pool;
    for (const tool of mcpResult.tools) {
      registry.register(tool);
    }
  } catch (e) {
    console.error(`[spark-cli] MCP client connection error: ${(e as Error).message}`);
  }

  const skills = createSkillRegistry();
  loadSkillsFromDisk(skills, root);
  const systemPrompt = opts.systemPromptOverride
    ? opts.appendSystemPrompt
      ? `${opts.systemPromptOverride}\n\n${opts.appendSystemPrompt}`
      : opts.systemPromptOverride
    : opts.appendSystemPrompt
      ? `${buildAgentSystemPrompt({
          projectRoot: root,
          writeMode: opts.writeMode,
          mode: opts.mode,
          userInputForKnowledgeRetrieval: opts.userInput,
          skills,
          effortLevel: opts.effortLevel,
        })}\n\n${opts.appendSystemPrompt}`
      : buildAgentSystemPrompt({
          projectRoot: root,
          writeMode: opts.writeMode,
          mode: opts.mode,
          userInputForKnowledgeRetrieval: opts.userInput,
          skills,
          effortLevel: opts.effortLevel,
        });
  const maxTokens = resolveOutputMaxTokens(config);
  const contextBudget = opts.contextBudget ?? resolveContextBudget(config, resolved);

  const completeFn = async (
    messages: ChatMessage[],
    options: {
      tools?: ToolDefinition[];
      toolChoice?: 'auto' | 'none' | 'required';
      maxTokens?: number;
      onDelta?: (delta: string) => void;
    },
  ): Promise<ProviderResponse> => {
    return completeChat(resolved, messages, {
      maxTokens: options.maxTokens ?? maxTokens,
      tools: options.tools,
      toolChoice: options.toolChoice,
      config,
      onDelta: options.onDelta,
      effortLevel: opts.effortLevel,
    });
  };

  let result: RunAgentTurnResult;
  try {
    result = await runAgentTurn(opts.history, opts.userInput, {
      projectRoot: root,
      config,
      registry,
      completeFn,
      systemPrompt,
      writeMode: opts.writeMode,
      mode: opts.mode,
      permissionMode: opts.permissionMode,
      disallowedTools: opts.disallowedTools,
      agentAllowedTools: opts.agentAllowedTools,
      agentId: opts.agentId,
      maxTokens,
      maxIterations: opts.maxTurns,
      maxBudgetUsd: opts.maxBudgetUsd,
      abortSignal: opts.abortSignal,
      onIteration: opts.onIteration,
      onDelta: opts.onDelta,
      onToolCompleted: opts.onToolCompleted,
      userMessage,
      hooks: loadHookConfig(root),
      skills,
      toolPermissionSession: opts.toolPermissionSession,
      confirmTool: opts.confirmTool,
      askUser: opts.askUser,
      contextBudget,
    });
  } finally {
    // Disconnect MCP clients after the turn completes
    if (mcpPool) {
      await mcpPool.disconnectAll().catch(() => {});
    }
  }

  return {
    ...result,
    model: `${resolved.providerId}/${resolved.model}`,
    atRefs,
  };
}
