/**
 * task: spawn a sub-agent to handle a focused subtask.
 *
 * The sub-agent inherits projectRoot/config/model from the parent but runs in
 * a fresh history. By default it gets a read-only toolset; the model widens
 * via the `tools` arg, and the parent's tool inventory bounds the choice.
 *
 * The result is the sub-agent's final assistant prose, returned as the tool
 * result so the parent can keep reasoning over it.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { spawnSubAgent } from '../sub-agent.js';

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const prompt = args.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { content: 'task: `prompt` must be a non-empty string', isError: true };
  }
  if (!ctx.subAgent) {
    return {
      content:
        'task: sub-agent dependencies not attached to this context. Cannot spawn.',
      isError: true,
    };
  }

  const tools = Array.isArray(args.tools)
    ? (args.tools as unknown[]).filter((t): t is string => typeof t === 'string')
    : undefined;

  const sub = await spawnSubAgent({
    prompt,
    tools,
    parent: ctx,
    completeFn: ctx.subAgent.completeFn,
    parentRegistry: ctx.subAgent.parentRegistry,
    systemPrompt: ctx.subAgent.systemPrompt,
  });

  return {
    content: sub.content || '(sub-agent returned no content)',
    isError: sub.isError,
    structured: { iterations: sub.iterations },
  };
}

export const taskTool: RegisteredTool = {
  name: 'task',
  description:
    'Spawn a sub-agent with a fresh context to handle a focused research or read-only subtask. Returns the sub-agent\'s final answer.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The instruction the sub-agent should solve.',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional whitelist of tool names the sub-agent may call. Defaults to read-only.',
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  handler,
};
