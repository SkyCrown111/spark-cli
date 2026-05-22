/**
 * Skill body processor — handles dynamic injection and variable substitution.
 *
 * Features:
 * - `` !`command` `` syntax: executes shell command and injects stdout
 * - `$ARGUMENTS`: full argument string passed to the skill
 * - `$0`, `$1`, …: positional arguments
 * - `${SPARK_SESSION_ID}`: current session ID
 * - `${SPARK_SKILL_DIR}`: directory containing the skill file
 * - `${SPARK_PROJECT_ROOT}`: project root directory
 */

import { execSync } from 'node:child_process';
import type { Skill } from './registry.js';

export interface SkillProcessContext {
  /** Arguments passed to the skill (e.g. from load_skill or /skill). */
  arguments?: string;
  /** Current session ID. */
  sessionId?: string;
  /** Directory containing the skill file. */
  skillDir?: string;
  /** Project root directory. */
  projectRoot?: string;
}

/**
 * Process a skill body: expand variables and execute inline commands.
 */
export function processSkillBody(
  body: string,
  ctx: SkillProcessContext = {},
): string {
  let result = body;

  // 1. Execute `` !`command` `` inline commands
  result = result.replace(/!`([^`]+)`/g, (_match, cmd: string) => {
    try {
      const output = execSync(cmd, {
        encoding: 'utf8',
        timeout: 10_000,
        cwd: ctx.projectRoot ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output.trim();
    } catch (e) {
      return `[command failed: ${(e as Error).message}]`;
    }
  });

  // 2. Split arguments for positional replacement
  const args = ctx.arguments
    ? ctx.arguments.split(/\s+/).filter(Boolean)
    : [];

  // 3. Replace $ARGUMENTS (full argument string)
  result = result.replace(/\$ARGUMENTS/g, ctx.arguments ?? '');

  // 4. Replace $0, $1, … positional arguments
  result = result.replace(/\$(\d+)/g, (_match, idx: string) => {
    const i = parseInt(idx, 10);
    return args[i] ?? '';
  });

  // 5. Replace ${SPARK_SESSION_ID}
  result = result.replace(/\$\{SPARK_SESSION_ID\}/g, ctx.sessionId ?? '');

  // 6. Replace ${SPARK_SKILL_DIR}
  result = result.replace(/\$\{SPARK_SKILL_DIR\}/g, ctx.skillDir ?? '');

  // 7. Replace ${SPARK_PROJECT_ROOT}
  result = result.replace(/\$\{SPARK_PROJECT_ROOT\}/g, ctx.projectRoot ?? '');

  return result;
}

/**
 * Check if a skill can be invoked by the model.
 */
export function canModelInvoke(skill: Skill): boolean {
  return skill.disableModelInvocation !== true;
}

/**
 * Check if a skill can be invoked by the user via /skill.
 */
export function canUserInvoke(skill: Skill): boolean {
  return skill.userInvocable !== false;
}
