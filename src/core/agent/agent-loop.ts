/**
 * ReAct agent loop.
 *
 * Iterates: model → tool_calls → execute → tool messages → model, until the
 * model emits a final text response (no tool_calls) or the iteration cap is
 * hit. Each iteration is one provider call.
 *
 * Design choices:
 * - The provider call is injected (`completeFn`) so tests can use the stub
 *   without spinning real HTTP.
 * - Tool dispatch is delegated to `tool-dispatcher.ts` so parallel-vs-serial
 *   policy and replay logging live in one place.
 * - History is mutated in place to keep the agent loop readable; callers pass
 *   a fresh array per turn.
 * - Errors from individual tool calls become `role:'tool'` messages (with the
 *   error content) so the model can self-correct. Errors from the provider
 *   propagate.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type {
  ProviderResponse,
  ToolCall,
  ToolDefinition,
} from '../providers/types.js';
import type {
  ToolContext,
  ToolRegistry,
  ToolRunMode,
  ToolWriteMode,
} from './tool-registry.js';
import { dispatchToolCalls, type DispatchedCall } from './tool-dispatcher.js';
import type { HookConfig } from '../hooks/config.js';
import { runHooks } from '../hooks/runner.js';
import type { SkillRegistry } from '../skills/registry.js';
import {
  compactHistory,
  HARD_TURN_CAP,
} from '../context/compaction.js';
import { computeBudgetStatus } from '../context/token-budget.js';
import { appendReplayEvent } from '../replay/log.js';

export const DEFAULT_MAX_ITERATIONS = 25;
/** Default context-window history budget when not configured. */
export const DEFAULT_CONTEXT_BUDGET = 32000;
/** Threshold at which compaction triggers (fraction of budget). */
export const COMPACTION_THRESHOLD = 0.75;

export interface CompletionFn {
  (
    messages: ChatMessage[],
    options: {
      tools?: ToolDefinition[];
      toolChoice?: 'auto' | 'none' | 'required';
      maxTokens?: number;
      /**
       * Optional streaming callback. Set by REPL/`chat` for live token output.
       * Providers that don't support streaming (Anthropic, cloud proxy) silently
       * ignore it and return the same shape.
       */
      onDelta?: (delta: string) => void;
    },
  ): Promise<ProviderResponse>;
}

export interface RunAgentTurnOptions {
  /** Project root, used for replay logging and tool ctx. */
  projectRoot: string;
  config: import('../../config/schema.js').SparkCLIConfig;
  registry: ToolRegistry;
  completeFn: CompletionFn;
  systemPrompt: string;
  writeMode: ToolWriteMode;
  mode: ToolRunMode;
  agentId: string;
  parentAgentId?: string;
  depth?: number;
  maxIterations?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  /** Pre-loaded hook config; threaded through to tool dispatch. */
  hooks?: HookConfig;
  /** Skill registry; the load_skill tool reaches it via ToolContext. */
  skills?: SkillRegistry;
  /**
   * Called once per iteration so the REPL/UI can render progress
   * (spinner text, tool-call previews, etc.).
   */
  onIteration?: (info: IterationInfo) => void;
  /**
   * Live streaming callback. Forwarded to the provider when supported. Fires
   * per content fragment; the REPL pipes it to stdout. Independent of
   * `onIteration`, which fires once per provider call boundary.
   */
  onDelta?: (delta: string) => void;
  /** Override the string user turn (e.g. vision multimodal message). */
  userMessage?: ChatMessage;
  /** Fired after each tool call completes (inline diff, logging). */
  onToolCompleted?: (call: import('./tool-dispatcher.js').DispatchedCall) => void;
  toolPermissionSession?: import('./tool-permissions.js').ToolPermissionSession;
  confirmTool?: import('./tool-permissions.js').ToolConfirmFn;
  askUser?: import('./tool-permissions.js').AskUserFn;
  contextBudget?: number;
}

export interface IterationInfo {
  iteration: number;
  assistantText: string;
  toolCalls: ToolCall[];
  dispatched?: DispatchedCall[];
}

export interface RunAgentTurnResult {
  /** Final assistant prose. May be empty if the loop stopped early. */
  finalContent: string;
  /** Reason the loop stopped. */
  stopReason: 'end_turn' | 'iteration_cap' | 'aborted' | 'no_tools' | 'other';
  iterations: number;
  /** History after the turn, ready to be persisted by the caller. */
  history: ChatMessage[];
  /** Aggregated usage across all provider calls in this turn. */
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  /** Every tool call dispatched, in order. */
  toolCalls: DispatchedCall[];
}

export async function runAgentTurn(
  history: ChatMessage[],
  userInput: string,
  opts: RunAgentTurnOptions,
): Promise<RunAgentTurnResult> {
  const cfgAgent = opts.config.agent;
  const cfgCompaction = opts.config.compaction;
  const cfgContext = opts.config.context;
  const cfgSubagent = opts.config.subagent;

  const max = opts.maxIterations ?? cfgAgent?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const compactionThreshold = cfgCompaction?.threshold ?? COMPACTION_THRESHOLD;
  const compactionRecentN = cfgCompaction?.recentN;
  const budget = opts.contextBudget ?? cfgContext?.maxTokens ?? DEFAULT_CONTEXT_BUDGET;

  const userTurn: ChatMessage =
    opts.userMessage ?? { role: 'user', content: userInput };

  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    ...history,
    userTurn,
  ];

  const allDispatched: DispatchedCall[] = [];
  /** Last call's prompt_tokens = current context size; completions summed for stats. */
  const usage: { prompt_tokens: number; completion_tokens: number } = {
    prompt_tokens: 0,
    completion_tokens: 0,
  };

  const ctx: ToolContext = {
    projectRoot: opts.projectRoot,
    config: opts.config,
    writeMode: opts.writeMode,
    mode: opts.mode,
    agentId: opts.agentId,
    parentAgentId: opts.parentAgentId,
    depth: opts.depth ?? 0,
    abortSignal: opts.abortSignal,
    skills: opts.skills,
    skillAllowedTools: new Set<string>(),
    toolPermissionSession: opts.toolPermissionSession,
    confirmTool: opts.confirmTool,
    askUser: opts.askUser,
    subAgent: {
      parentRegistry: opts.registry,
      completeFn: opts.completeFn,
      systemPrompt: opts.systemPrompt,
      hooks: opts.hooks,
    },
  };

  for (let iter = 1; iter <= max; iter++) {
    if (opts.abortSignal?.aborted) {
      return finalize(messages, allDispatched, usage, '', 'aborted', iter - 1);
    }

    // Compaction guard. Apply between iterations so we never split a single
    // assistant→tool round-trip mid-history. Skip when there's nothing useful
    // to compact (the system prompt + a couple of turns).
    const nonSystem = messages[0]?.role === 'system' ? messages.slice(1) : messages;
    const status = computeBudgetStatus(nonSystem, budget, {
      threshold: compactionThreshold,
    });
    const overHardCap = nonSystem.length > HARD_TURN_CAP;
    if ((status.overThreshold || overHardCap) && nonSystem.length > 6) {
      const before = nonSystem.length;
      const { history: compacted, summary, compactedCount } = await compactHistory(
        nonSystem,
        {
          completeFn: opts.completeFn,
          maxTokens: opts.maxTokens,
          recentN: compactionRecentN,
        },
      );
      // Re-assemble: keep the system prompt at index 0.
      messages.length = 0;
      messages.push({ role: 'system', content: opts.systemPrompt });
      for (const m of compacted) messages.push(m);
      appendReplayEvent(opts.projectRoot, 'compaction', {
        agentId: opts.agentId,
        iteration: iter,
        before,
        after: compacted.length,
        compactedCount,
        summaryPreview: summary.slice(0, 200),
        reason: overHardCap ? 'hard_cap' : 'threshold',
      });
      if (opts.hooks) {
        runHooks(
          'on_compaction',
          {
            event: 'on_compaction',
            projectRoot: opts.projectRoot,
            agentId: opts.agentId,
            before,
            after: compacted.length,
            compactedCount,
            reason: overHardCap ? 'hard_cap' : 'threshold',
          },
          opts.projectRoot,
          { config: opts.hooks },
        );
      }
    }

    const tools = opts.registry.list({ mode: opts.mode });
    const res = await opts.completeFn(messages, {
      tools: tools.length > 0 ? tools : undefined,
      toolChoice: tools.length > 0 ? 'auto' : undefined,
      maxTokens: opts.maxTokens,
      onDelta: opts.onDelta,
    });

    if (res.usage?.prompt_tokens) usage.prompt_tokens = res.usage.prompt_tokens;
    if (res.usage?.completion_tokens) {
      usage.completion_tokens += res.usage.completion_tokens;
    }

    const calls = res.tool_calls ?? [];

    // Append the assistant turn before dispatching, so the next provider call
    // sees the tool_calls referenced by the upcoming tool messages.
    messages.push({
      role: 'assistant',
      content: res.content,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });

    appendReplayEvent(opts.projectRoot, 'agent_iteration', {
      agentId: opts.agentId,
      parentAgentId: opts.parentAgentId,
      iteration: iter,
      toolCallCount: calls.length,
      stopReason: res.stop_reason,
      usage: res.usage,
    });

    opts.onIteration?.({
      iteration: iter,
      assistantText: res.content,
      toolCalls: calls,
    });

    if (calls.length === 0) {
      // Final answer.
      const finalStop: RunAgentTurnResult['stopReason'] =
        tools.length === 0 ? 'no_tools' : 'end_turn';
      return finalize(messages, allDispatched, usage, res.content, finalStop, iter);
    }

    // Dispatch tool calls; results become role:'tool' messages.
    const toolDispatchConcurrency =
      cfgAgent?.toolDispatchConcurrency ?? cfgSubagent?.concurrency ?? 3;
    const dispatched = await dispatchToolCalls(calls, opts.registry, ctx, {
      abortSignal: opts.abortSignal,
      hooks: opts.hooks,
      concurrency: toolDispatchConcurrency,
    });
    allDispatched.push(...dispatched);

    if (opts.onToolCompleted) {
      for (const d of dispatched) opts.onToolCompleted(d);
    }

    for (const d of dispatched) {
      messages.push({
        role: 'tool',
        tool_call_id: d.tool_call_id,
        content: d.result.content,
      });
    }

    opts.onIteration?.({
      iteration: iter,
      assistantText: res.content,
      toolCalls: calls,
      dispatched,
    });
  }

  // Iteration cap reached — return whatever the last assistant turn was.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const finalContent =
    lastAssistant && typeof lastAssistant.content === 'string' ? lastAssistant.content : '';
  return finalize(messages, allDispatched, usage, finalContent, 'iteration_cap', max);
}

function finalize(
  messages: ChatMessage[],
  toolCalls: DispatchedCall[],
  usage: { prompt_tokens: number; completion_tokens: number },
  finalContent: string,
  stopReason: RunAgentTurnResult['stopReason'],
  iterations: number,
): RunAgentTurnResult {
  // Strip the system prompt before returning; callers manage system prompt
  // composition separately.
  const history = messages[0]?.role === 'system' ? messages.slice(1) : messages;
  return {
    finalContent,
    stopReason,
    iterations,
    history,
    usage:
      usage.prompt_tokens || usage.completion_tokens
        ? {
            prompt_tokens: usage.prompt_tokens || undefined,
            completion_tokens: usage.completion_tokens || undefined,
          }
        : undefined,
    toolCalls,
  };
}
