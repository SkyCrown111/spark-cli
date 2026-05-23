/**
 * load_skill: meta-tool that returns a skill body and widens the tool
 * registry's per-session allow-list with the skill's `allowedTools`.
 *
 * The model uses this when it determines a specialized capability (e.g.
 * "tilemap patterns") will help mid-turn. The body is appended as the tool
 * result; subsequent tool calls in the same turn benefit from the widened
 * permissions via `ctx.skillAllowedTools`.
 *
 * Supports:
 * - Variable substitution ($ARGUMENTS, $0, $1, ${SPARK_SESSION_ID}, etc.)
 * - Dynamic context injection (`` !`command` `` syntax in skill body)
 * - Invocation control (disableModelInvocation, userInvocable)
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { appendReplayEvent } from '../../replay/log.js';
import { runHooks } from '../../hooks/runner.js';
import { processSkillBody, canModelInvoke } from '../../skills/processor.js';

async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const name = args.name;
  if (typeof name !== 'string' || !name.trim()) {
    return { content: 'load_skill: `name` must be a non-empty string', isError: true };
  }
  if (!ctx.skills) {
    return { content: 'load_skill: no skill registry attached to this session', isError: true };
  }
  const skill = ctx.skills.get(name);
  if (!skill) {
    const available =
      ctx.skills
        .list()
        .map((s) => s.name)
        .join(', ') || '(none)';
    return {
      content: `load_skill: skill "${name}" not found. Available: ${available}`,
      isError: true,
    };
  }

  // Check invocation control
  if (!canModelInvoke(skill)) {
    return {
      content: `load_skill: skill "${name}" has model invocation disabled. It can only be invoked by the user via /skill.`,
      isError: true,
    };
  }

  // Widen the per-session allow-list. The agent loop preserves this Set across
  // iterations because ToolContext is shared by reference.
  if (skill.allowedTools && ctx.skillAllowedTools) {
    for (const t of skill.allowedTools) ctx.skillAllowedTools.add(t);
  }

  appendReplayEvent(ctx.projectRoot, 'skill_load', {
    agentId: ctx.agentId,
    name: skill.name,
    allowedTools: skill.allowedTools ?? [],
  });
  if (ctx.subAgent?.hooks) {
    runHooks(
      'on_skill_load',
      {
        event: 'on_skill_load',
        projectRoot: ctx.projectRoot,
        agentId: ctx.agentId,
        name: skill.name,
        allowedTools: skill.allowedTools ?? [],
      },
      ctx.projectRoot,
      { config: ctx.subAgent.hooks },
    );
  }

  // Process skill body: expand variables and execute inline commands
  const skillArgs = typeof args.arguments === 'string' ? args.arguments : undefined;
  const processedBody = processSkillBody(skill.body, {
    arguments: skillArgs,
    sessionId: ctx.agentId,
    projectRoot: ctx.projectRoot,
  });

  const header = `Loaded skill: ${skill.name}${skill.description ? ` — ${skill.description}` : ''}`;
  return {
    content: `${header}\n\n${processedBody}`.trim(),
    structured: {
      name: skill.name,
      allowedTools: skill.allowedTools ?? [],
    },
  };
}

export const loadSkillTool: RegisteredTool = {
  name: 'load_skill',
  description:
    'Load a project skill by name. Returns the skill body and widens the toolset for this session.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The skill name (folder name under .spark/skills/).',
      },
      arguments: {
        type: 'string',
        description:
          'Optional arguments passed to the skill for variable substitution ($ARGUMENTS, $0, $1, ...).',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  handler,
};
