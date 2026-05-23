/**
 * Memory tools: `remember` (write) and `recall` (read).
 *
 * Memory is stored under `<projectRoot>/.spark/memory/project.json` and
 * surfaced into every system prompt via `formatMemoryForPrompt`. The agent
 * can persist load-bearing facts ("user prefers Cocos Creator 3.8", "scene
 * file lives at assets/scenes/Main.scene") so future sessions don't have to
 * rediscover them.
 *
 * `remember` mutates project memory but is not a destructive write (no fs
 * change outside `.spark`); we still mark `mutates: true` so plan mode
 * blocks it without an explicit skill grant.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { addProjectMemory, getProjectMemory, getSessionMemory } from '../../memory/store.js';
import { appendReplayEvent } from '../../replay/log.js';
import { getErrorMessage } from '../../../utils/errors.js';

const MAX_KEY_LEN = 128;
const MAX_VALUE_LEN = 4096;

async function rememberHandler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const key = args.key;
  const value = args.value;
  if (typeof key !== 'string' || !key.trim()) {
    return { content: 'remember: `key` must be a non-empty string', isError: true };
  }
  if (typeof value !== 'string') {
    return { content: 'remember: `value` must be a string', isError: true };
  }
  if (key.length > MAX_KEY_LEN) {
    return { content: `remember: key too long (${key.length}>${MAX_KEY_LEN})`, isError: true };
  }
  if (value.length > MAX_VALUE_LEN) {
    return {
      content: `remember: value too long (${value.length}>${MAX_VALUE_LEN})`,
      isError: true,
    };
  }
  try {
    const namespacedKey = ctx.memoryNamespace ? `${ctx.memoryNamespace}/${key.trim()}` : key.trim();
    addProjectMemory(ctx.projectRoot, namespacedKey, value);
  } catch (e) {
    return {
      content: `remember: failed to write memory: ${getErrorMessage(e)}`,
      isError: true,
    };
  }
  appendReplayEvent(ctx.projectRoot, 'tool_call', {
    tool: 'remember',
    agentId: ctx.agentId,
    key: key.trim(),
  });
  return {
    content: `Remembered "${key.trim()}".`,
    structured: { key: key.trim() },
  };
}

async function recallHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const key = typeof args.key === 'string' ? args.key.trim() : '';
  const project = getProjectMemory(ctx.projectRoot);
  const session = getSessionMemory(ctx.projectRoot);
  const all = [...project.entries, ...session.entries];

  // Filter by namespace if set
  const namespacePrefix = ctx.memoryNamespace ? `${ctx.memoryNamespace}/` : undefined;
  const scoped = namespacePrefix
    ? all.filter((e) => e.key.startsWith(namespacePrefix) || !e.key.includes('/'))
    : all;

  if (key) {
    const namespacedKey = namespacePrefix ? `${namespacePrefix}${key}` : key;
    const hit = all.find((e) => e.key === namespacedKey || e.key === key);
    if (!hit) {
      return { content: `recall: no memory for "${key}"` };
    }
    return {
      content: `${hit.key}: ${hit.value}`,
      structured: { key: hit.key, value: hit.value },
    };
  }
  if (scoped.length === 0) {
    return { content: 'recall: no memory entries.' };
  }
  const lines = scoped.map((e) => `- ${e.key}: ${e.value}`);
  return {
    content: lines.join('\n'),
    structured: { count: all.length },
  };
}

export const rememberTool: RegisteredTool = {
  name: 'remember',
  description:
    'Save a load-bearing fact to project memory under `key`. Memory persists across sessions and is injected into every system prompt.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Short identifier (e.g. "main_scene_path").' },
      value: { type: 'string', description: 'The fact to remember.' },
    },
    required: ['key', 'value'],
    additionalProperties: false,
  },
  handler: rememberHandler,
};

export const recallTool: RegisteredTool = {
  name: 'recall',
  description:
    'Look up project + session memory. Pass `key` for a specific entry, or call without args to list everything.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The memory key to retrieve. Omit to list all.' },
    },
    additionalProperties: false,
  },
  handler: recallHandler,
};
