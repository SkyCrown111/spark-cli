/**
 * task_output: read captured stdout/stderr from a background task.
 *
 * `since: 'last'` (default) returns only the bytes that arrived since the last
 * read on this task — useful for polling. `since: 'start'` returns the full
 * buffered snapshot (capped at 1 MB per stream; older bytes are dropped and
 * `truncated` is set).
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { getBackgroundManager } from '../background-tasks.js';

async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const id = args.id;
  if (typeof id !== 'string' || id.length === 0) {
    return { content: 'task_output: `id` must be a non-empty string', isError: true };
  }
  const since = args.since === 'start' ? 'start' : 'last';

  const result = getBackgroundManager().read(id, { since });
  if (!result) {
    return { content: `task_output: no task with id "${id}"`, isError: true };
  }

  const { info, stdout, stderr, truncated } = result;
  const parts: string[] = [];
  parts.push(
    `task ${info.id} status=${info.status}${info.exitCode != null ? ` exit=${info.exitCode}` : ''}`,
  );
  if (stdout) parts.push(stdout.replace(/\s+$/, ''));
  if (stderr) parts.push(`[stderr]\n${stderr.replace(/\s+$/, '')}`);
  if (!stdout && !stderr) parts.push('(no new output)');
  if (truncated) parts.push('[buffer truncated — older bytes dropped]');

  return {
    content: parts.join('\n\n'),
    structured: {
      id: info.id,
      status: info.status,
      exitCode: info.exitCode,
      truncated,
    },
  };
}

export const taskOutputTool: RegisteredTool = {
  name: 'task_output',
  description:
    'Read captured stdout/stderr from a background task started via bash_background. Use since="last" (default) to read incremental output, since="start" for the full buffered snapshot.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Task ID returned by bash_background.',
      },
      since: {
        type: 'string',
        enum: ['start', 'last'],
        description: 'Which slice of output to return. Default "last".',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler,
};
