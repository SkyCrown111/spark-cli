/**
 * Tool registry for the agent loop.
 *
 * - Tools register themselves with a JSON-Schema parameter spec; the registry
 *   exports them as OpenAI-shape `ToolDefinition[]` to the model.
 * - `dispatch` runs a single tool by name, defending against permission and
 *   plan-mode violations regardless of whether the same check happened in
 *   `list({mode})`. Defense in depth: list filters; dispatch enforces.
 * - MCP tools are adapted into the registry via `mcp-adapter.ts`; they don't
 *   drive the registry shape.
 *
 * This file deliberately exposes no global singleton — the agent loop
 * constructs a registry per session so plan mode and skill-driven dynamic
 * widening can scope cleanly.
 */

import type { ToolDefinition } from '../providers/types.js';
import type { SparkCLIConfig } from '../../config/schema.js';
import { isToolAllowed } from './permissions.js';
import type { PermissionMode } from '../../state/AppState.js';
import {
  isSensitiveTool,
  summarizeToolArgs,
  type AskUserFn,
  type ToolConfirmFn,
  type ToolPermissionSession,
} from './tool-permissions.js';
import { getErrorMessage } from '../../utils/errors.js';

export type ToolWriteMode = 'staging' | 'direct';
export type ToolRunMode = 'normal' | 'plan' | 'auto';

/**
 * Information passed to every tool handler. The registry assembles this once
 * per agent turn and re-uses it for parallel `Promise.all` dispatch.
 */
export interface ToolContext {
  projectRoot: string;
  config: SparkCLIConfig;
  /** `staging` (default) or `direct` (the `--auto` / `/auto` toggle). */
  writeMode: ToolWriteMode;
  /** `normal` (full toolset), `plan` (read-only), `auto` (alias of `normal`). */
  mode: ToolRunMode;
  /** Current permission mode (default/plan/auto/acceptEdits/dontAsk/bypass). */
  permissionMode?: PermissionMode;
  /** Tools explicitly denied by CLI --disallowedTools flag. */
  disallowedTools?: Set<string>;
  /** Tools allowed by the active agent definition (restricts to this set). */
  agentAllowedTools?: Set<string>;
  /** Optional memory namespace prefix for sub-agent isolation. */
  memoryNamespace?: string;
  /** Identifier for the agent that issued the call (root or sub-agent). */
  agentId: string;
  /** Used for sub-agent depth gating. */
  parentAgentId?: string;
  /** Sub-agent depth; 0 for the top-level agent. */
  depth: number;
  /** Aborts long-running tools (bash, fetches) when the user hits Ctrl-C. */
  abortSignal?: AbortSignal;
  /** Skill registry for the `load_skill` meta-tool. Optional. */
  skills?: import('../skills/registry.js').SkillRegistry;
  /** Set of tool names dynamically allowed by skills loaded this session. */
  skillAllowedTools?: Set<string>;
  /** Session-scoped allow list for sensitive tools (bash, write, …). */
  toolPermissionSession?: ToolPermissionSession;
  /** Hook decision from pre_tool hook (allow/deny/ask/defer). */
  hookDecision?: string;
  /** Additional context from pre_tool hook. */
  hookAdditionalContext?: string;
  /** When set, sensitive tools prompt before running (REPL). */
  confirmTool?: ToolConfirmFn;
  /** When set, the `ask_user_question` tool can talk to the user (REPL only). */
  askUser?: AskUserFn;
  /** Sub-agent dependencies for the `task` tool. Set by `runAgentTurn`. */
  subAgent?: {
    parentRegistry: ToolRegistry;
    completeFn: import('./agent-loop.js').CompletionFn;
    systemPrompt: string;
    /** Hooks active in the parent; threaded into child runs. */
    hooks?: import('../hooks/config.js').HookConfig;
  };
}

export interface ToolResult {
  /** Plain string returned to the model as the tool message content. */
  content: string;
  /** True if the tool returned an error; the loop still continues. */
  isError?: boolean;
  /** Optional structured payload kept off the wire, used by replay logging. */
  structured?: Record<string, unknown>;
}

export interface RegisteredTool {
  /** Tool name as the model will see it. Snake-case by convention. */
  name: string;
  /** Short, model-readable description of what the tool does. */
  description: string;
  /** JSON Schema for the arguments the model will pass. */
  parameters: Record<string, unknown>;
  /** Whether this tool is allowed in plan mode (read-only by default). */
  planModeAllowed?: boolean;
  /** Whether this tool mutates the filesystem or external state. */
  mutates?: boolean;
  /** Where this tool came from: 'builtin' (default) or 'mcp-client'. */
  source?: 'builtin' | 'mcp-client';
  /** When source is 'mcp-client', the name of the MCP server providing it. */
  mcpServerName?: string;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: RegisteredTool): void;
  unregister(name: string): void;
  has(name: string): boolean;
  get(name: string): RegisteredTool | undefined;
  /**
   * List tools as OpenAI-shape definitions, filtered by mode (plan mode hides
   * mutating tools).
   */
  list(filter?: { mode?: ToolRunMode }): ToolDefinition[];
  /**
   * Run a tool by name. Errors are converted to `{content, isError:true}` so
   * the model can self-correct instead of blowing up the turn.
   */
  dispatch(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult>;
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  return {
    register(tool) {
      tools.set(tool.name, tool);
    },
    unregister(name) {
      tools.delete(name);
    },
    has(name) {
      return tools.has(name);
    },
    get(name) {
      return tools.get(name);
    },
    list(filter) {
      const out: ToolDefinition[] = [];
      for (const t of tools.values()) {
        if (filter?.mode === 'plan' && !t.planModeAllowed) continue;
        out.push({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        });
      }
      return out;
    },
    async dispatch(name, rawArgs, ctx) {
      const tool = tools.get(name);
      if (!tool) {
        return {
          content: `Tool "${name}" is not registered.`,
          isError: true,
        };
      }

      // Parse args first so we can pass them to permission check
      let args: Record<string, unknown> = {};
      if (rawArgs && rawArgs.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawArgs);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          } else {
            return {
              content: `Tool "${name}": arguments must be a JSON object, got ${typeof parsed}.`,
              isError: true,
            };
          }
        } catch (e) {
          return {
            content: `Tool "${name}": invalid JSON arguments: ${getErrorMessage(e)}`,
            isError: true,
          };
        }
      }

      // Single-source permission check (absorbs MCP write-guard + plan mode + config rules).
      const perm = isToolAllowed({
        toolName: tool.name,
        mutates: tool.mutates ?? false,
        planModeAllowed: tool.planModeAllowed ?? false,
        mode: ctx.mode,
        writeMode: ctx.writeMode,
        config: ctx.config,
        skillAllowedTools: ctx.skillAllowedTools,
        permissionMode: ctx.permissionMode,
        toolArgs: args,
        source: tool.source,
        disallowedTools: ctx.disallowedTools,
        agentAllowedTools: ctx.agentAllowedTools,
      });
      if (!perm.allowed) {
        return { content: perm.reason ?? 'Tool not allowed.', isError: true };
      }

      // askOverride: permission is allowed but the user should be prompted
      // (e.g. protected path in acceptEdits mode, or config rule with action 'ask')
      // Hook 'allow' decision skips confirmation entirely.
      const hookAllows = ctx.hookDecision === 'allow';
      const needsConfirm =
        !hookAllows &&
        (perm.askOverride ||
          (ctx.confirmTool &&
            isSensitiveTool(name) &&
            !ctx.toolPermissionSession?.isAlwaysAllowed(name)));

      if (needsConfirm && ctx.confirmTool) {
        const allowed = await ctx.confirmTool({
          tool: name,
          argsSummary: summarizeToolArgs(name, args),
        });
        if (!allowed) {
          return {
            content: `Tool "${name}" was denied by the user.`,
            isError: true,
          };
        }
      }
      try {
        return await tool.handler(args, ctx);
      } catch (e) {
        return {
          content: `Tool "${name}" threw: ${getErrorMessage(e)}`,
          isError: true,
        };
      }
    },
  };
}
