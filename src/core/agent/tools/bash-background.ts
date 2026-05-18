/**
 * bash_background: launch a long-running shell command and return immediately.
 *
 * Output is captured into a 1 MB ring buffer per stream. Read incremental output
 * with `task_output`, terminate with `task_stop`. The agent loop's `session_end`
 * hook should call `getBackgroundManager().stopAll()` to avoid leaking processes.
 *
 * Use when:
 * - The command is expected to outlast the 5-minute `bash` cap (dev servers,
 *   watchers, build daemons).
 * - You want to interleave reading partial output with other tool calls.
 *
 * Do NOT use for short, synchronous commands — `bash` is simpler and returns
 * captured output in a single round trip.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { getBackgroundManager } from '../background-tasks.js';

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const command = args.command;
  if (typeof command !== 'string' || command.trim().length === 0) {
    return { content: 'bash_background: `command` must be a non-empty string', isError: true };
  }

  let env: Record<string, string> | undefined;
  if (args.env !== undefined) {
    if (typeof args.env !== 'object' || args.env === null || Array.isArray(args.env)) {
      return { content: 'bash_background: `env` must be an object of string→string', isError: true };
    }
    env = {};
    for (const [k, v] of Object.entries(args.env as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        return { content: `bash_background: env.${k} must be a string`, isError: true };
      }
      env[k] = v;
    }
  }

  const info = getBackgroundManager().start({
    command,
    cwd: ctx.projectRoot,
    env,
  });

  return {
    content:
      `Started background task ${info.id}\n` +
      `$ ${command}\n` +
      `Use task_output(id="${info.id}") to read stdout/stderr, ` +
      `task_stop(id="${info.id}") to terminate.`,
    structured: { id: info.id, status: info.status, startedAt: info.startedAt },
  };
}

export const bashBackgroundTool: RegisteredTool = {
  name: 'bash_background',
  description:
    'Launch a long-running shell command in the background and return a task ID. Use for dev servers, watchers, or any command expected to outlast the synchronous bash 5-minute cap. Read output via task_output, terminate via task_stop.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to run, relative to the project root.',
      },
      env: {
        type: 'object',
        description: 'Optional environment variable overrides (string→string).',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
  handler,
};
