/**
 * task_stop: terminate a background task by ID.
 *
 * Sends SIGKILL (or `taskkill /F /T` on Windows) to the process group and marks
 * the task as `killed`. The buffered output remains readable via `task_output`
 * for the retention window (1 hour after exit).
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { getBackgroundManager } from '../background-tasks.js';

async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const id = args.id;
  if (typeof id !== 'string' || id.length === 0) {
    return { content: 'task_stop: `id` must be a non-empty string', isError: true };
  }
  const info = getBackgroundManager().stop(id);
  if (!info) {
    return { content: `task_stop: no task with id "${id}"`, isError: true };
  }
  return {
    content: `task ${info.id} status=${info.status}${info.exitCode != null ? ` exit=${info.exitCode}` : ''}`,
    structured: { id: info.id, status: info.status, exitCode: info.exitCode },
  };
}

export const taskStopTool: RegisteredTool = {
  name: 'task_stop',
  description:
    'Terminate a background task started via bash_background. Output remains readable via task_output for ~1h after termination.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID returned by bash_background.' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler,
};
