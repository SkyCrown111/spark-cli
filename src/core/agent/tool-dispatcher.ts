/**
 * Tool dispatcher for the agent loop.
 *
 * - Runs a batch of `tool_calls` (as emitted by the model in one assistant
 *   turn) in parallel via `Promise.all`, with two carve-outs:
 *     * `bash` runs serially across the batch (same cwd; concurrent shells
 *       interleave too easily).
 *     * Concurrency capped via a small semaphore (default 3) to keep
 *       file/network/io behavior predictable.
 * - Each call is wrapped in a replay-log event. Long outputs are truncated in
 *   the log (full content stays in the live agent history).
 * - Reraises nothing — all errors land back in the model as `role:'tool'`
 *   messages with `isError:true` so the loop can recover.
 */

import type { ToolCall } from '../providers/types.js';
import type { ToolContext, ToolRegistry, ToolResult } from './tool-registry.js';
import { appendReplayEvent } from '../replay/log.js';
import { runHooks } from '../hooks/runner.js';
import type { HookConfig } from '../hooks/config.js';
import type { SandboxConfig } from './sandbox.js';
import { checkFilePath, checkBashCommand, extractPathsFromArgs } from './sandbox.js';

export interface DispatchedCall {
  tool_call_id: string;
  tool: string;
  result: ToolResult;
  durationMs: number;
}

const REPLAY_CONTENT_TRUNCATE = 8 * 1024;

function makeSemaphore(max: number): {
  acquire: () => Promise<() => void>;
} {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = (): void => {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  };
  return {
    async acquire() {
      if (active < max) {
        active++;
        return release;
      }
      return new Promise<() => void>((resolveAcquire) => {
        queue.push(() => resolveAcquire(release));
      });
    },
  };
}

function truncateForReplay(content: string): {
  content: string;
  truncated: boolean;
} {
  if (content.length <= REPLAY_CONTENT_TRUNCATE) {
    return { content, truncated: false };
  }
  return {
    content: `${content.slice(0, REPLAY_CONTENT_TRUNCATE)}\n…[truncated ${content.length - REPLAY_CONTENT_TRUNCATE} chars]`,
    truncated: true,
  };
}

export interface DispatchOptions {
  concurrency?: number;
  /** Used as cancellation gate; aborted calls return a synthetic error result. */
  abortSignal?: AbortSignal;
  /** Pre-loaded hook config; if undefined, hooks are skipped. */
  hooks?: HookConfig;
  /** Sandbox config for filesystem/network restrictions. If undefined, sandbox is disabled. */
  sandbox?: SandboxConfig;
}

export async function dispatchToolCalls(
  calls: ToolCall[],
  registry: ToolRegistry,
  ctx: ToolContext,
  opts: DispatchOptions = {},
): Promise<DispatchedCall[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const sem = makeSemaphore(concurrency);

  // Bash calls run serially across the batch — chain them via a single promise.
  let bashChain: Promise<unknown> = Promise.resolve();

  const tasks = calls.map((tc): Promise<DispatchedCall> => {
    const isBash = tc.function.name === 'bash';
    const run = async (): Promise<DispatchedCall> => {
      if (opts.abortSignal?.aborted) {
        return {
          tool_call_id: tc.id,
          tool: tc.function.name,
          result: { content: 'Cancelled by user.', isError: true },
          durationMs: 0,
        };
      }
      // pre_tool hook (blocking).
      let hookDecision: string | undefined;
      let hookAdditionalContext: string | undefined;
      if (opts.hooks) {
        const pre = runHooks(
          'pre_tool',
          {
            event: 'pre_tool',
            projectRoot: ctx.projectRoot,
            tool: tc.function.name,
            args: tc.function.arguments ?? '',
            agentId: ctx.agentId,
            writeMode: ctx.writeMode,
          },
          ctx.projectRoot,
          { config: opts.hooks, tool: tc.function.name },
        );
        hookDecision = pre.decision;
        hookAdditionalContext = pre.additionalContext;

        // Explicit deny decision or legacy blocking
        if (pre.decision === 'deny' || pre.blocked) {
          const reason =
            pre.decision === 'deny'
              ? (pre.additionalContext ?? 'Denied by pre_tool hook.')
              : (pre.reason ?? 'Blocked by pre_tool hook.');
          appendReplayEvent(ctx.projectRoot, 'tool_call', {
            tool: tc.function.name,
            args: tc.function.arguments,
            agentId: ctx.agentId,
            parentAgentId: ctx.parentAgentId,
            depth: ctx.depth,
            durationMs: 0,
            isError: true,
            blockedByHook: true,
            result: { content: reason, truncated: false },
          });
          return {
            tool_call_id: tc.id,
            tool: tc.function.name,
            result: {
              content: `Blocked by pre_tool hook: ${reason}`,
              isError: true,
            },
            durationMs: 0,
          };
        }
      }

      // ── Sandbox checks ──
      if (opts.sandbox?.enabled) {
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments ?? '{}');
        } catch {
          /* ignore parse errors */
        }

        // Check bash commands
        if (toolName === 'bash' && typeof args.command === 'string') {
          const bashCheck = checkBashCommand(args.command, opts.sandbox);
          if (!bashCheck.allowed) {
            return {
              tool_call_id: tc.id,
              tool: toolName,
              result: { content: `Sandbox: ${bashCheck.reason}`, isError: true },
              durationMs: 0,
            };
          }
        }

        // Check file paths
        const paths = extractPathsFromArgs(toolName, args);
        for (const path of paths) {
          const pathCheck = checkFilePath(path, ctx.projectRoot, opts.sandbox);
          if (!pathCheck.allowed) {
            return {
              tool_call_id: tc.id,
              tool: toolName,
              result: { content: `Sandbox: ${pathCheck.reason}`, isError: true },
              durationMs: 0,
            };
          }
        }
      }

      const start = Date.now();
      const result = await registry.dispatch(tc.function.name, tc.function.arguments ?? '{}', {
        ...ctx,
        abortSignal: opts.abortSignal,
        hookDecision,
        hookAdditionalContext,
      });
      const durationMs = Date.now() - start;
      const replayContent = truncateForReplay(result.content);
      appendReplayEvent(ctx.projectRoot, 'tool_call', {
        tool: tc.function.name,
        args: tc.function.arguments,
        agentId: ctx.agentId,
        parentAgentId: ctx.parentAgentId,
        depth: ctx.depth,
        durationMs,
        isError: !!result.isError,
        result: {
          content: replayContent.content,
          truncated: replayContent.truncated,
          structured: result.structured,
        },
      });
      // post_tool hook (advisory).
      if (opts.hooks) {
        runHooks(
          'post_tool',
          {
            event: 'post_tool',
            projectRoot: ctx.projectRoot,
            tool: tc.function.name,
            args: tc.function.arguments ?? '',
            agentId: ctx.agentId,
            durationMs,
            isError: !!result.isError,
          },
          ctx.projectRoot,
          { config: opts.hooks, tool: tc.function.name },
        );
      }
      return { tool_call_id: tc.id, tool: tc.function.name, result, durationMs };
    };

    if (isBash) {
      const p = bashChain.then(run);
      bashChain = p.catch(() => undefined);
      return p;
    }

    return (async () => {
      const release = await sem.acquire();
      try {
        return await run();
      } finally {
        release();
      }
    })();
  });

  return await Promise.all(tasks);
}
