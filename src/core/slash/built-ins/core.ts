/**
 * Core built-in slash commands: help, exit, clear, refresh, auto, doctor,
 * validate, init, plan, status, tokens, compact, skills, hooks, memory,
 * replay, bash.
 */

import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SlashCommand } from '../registry.js';
import { runDoctor } from '../../../commands/doctor.js';
import { runValidate } from '../../../commands/validate.js';
import { runInit } from '../../../commands/init.js';
import { refreshProjectContext } from '../../agent/system-prompt.js';
import { refreshProjectInstructions } from '../../instructions/loader.js';
import { resolveProjectRoot } from '../../../utils/output.js';
import { createSkillRegistry } from '../../skills/registry.js';
import { loadSkillsFromDisk } from '../../skills/loader.js';
import { loadHookConfig } from '../../hooks/config.js';
import { getProjectMemory, getSessionMemory } from '../../memory/store.js';
import { getProjectSparkDir } from '../../../config/paths.js';
import { builtin } from './types.js';

export function buildCoreCommands(): SlashCommand[] {
  return [
    builtin('help', 'Show available commands', async () => {
      return { kind: 'handled' };
    }),
    builtin('exit', 'Exit the session', async () => ({ kind: 'exit' })),
    builtin('quit', 'Exit the session', async () => ({ kind: 'exit' })),
    builtin('clear', 'Clear conversation history', async () => {
      logger.info(chalk.dim('Conversation cleared.'));
      return { kind: 'state-clear-history' };
    }),
    builtin(
      'refresh',
      'Re-scan project context and instructions',
      async (_args, { globalOpts }) => {
        const root = resolveProjectRoot(globalOpts);
        refreshProjectContext(root);
        refreshProjectInstructions(root);
        logger.info(chalk.dim('Project context and instructions re-scanned.'));
        return { kind: 'handled' };
      },
    ),
    builtin('auto', 'Toggle direct-write mode (on / off)', async (args) => {
      const arg = args.trim().toLowerCase();
      if (arg === 'on') {
        return { kind: 'state-set-write-mode', writeMode: 'direct' };
      }
      if (arg === 'off') {
        return { kind: 'state-set-write-mode', writeMode: 'staging' };
      }
      return { kind: 'state-set-write-mode', writeMode: 'toggle' };
    }),
    builtin('doctor', 'Environment check', async (_args, { globalOpts }) => {
      await runDoctor(globalOpts);
      return { kind: 'handled' };
    }),
    builtin('validate', 'Run project validation', async (_args, { globalOpts }) => {
      await runValidate(globalOpts);
      return { kind: 'handled' };
    }),
    builtin('init', 'Initialize SparkCLI in this project', async (_args, { globalOpts }) => {
      await runInit(globalOpts);
      return { kind: 'handled' };
    }),
    builtin('plan', 'Enter plan mode (read-only; review before apply)', async () => {
      return { kind: 'enter-plan' };
    }),
    builtin('status', 'Show token budget for the current session', async () => {
      return { kind: 'state-show-status' };
    }),
    builtin('tokens', 'Alias for /status — show token budget', async () => {
      return { kind: 'state-show-status' };
    }),
    builtin('compact', 'Force-compact the conversation history now', async () => {
      return { kind: 'state-compact-history' };
    }),
    builtin('skills', 'List installed skills', async (_args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const reg = createSkillRegistry();
      loadSkillsFromDisk(reg, root);
      const skills = reg.list();
      if (skills.length === 0) {
        logger.info(chalk.dim('No skills installed.'));
        logger.info(chalk.dim('  Add one at .spark/skills/<name>/SKILL.md.'));
      } else {
        const max = Math.max(...skills.map((s) => s.name.length));
        for (const s of skills) {
          const desc = s.description ? ` — ${s.description}` : '';
          const modelBlock = s.disableModelInvocation ? chalk.yellow(' [model-blocked]') : '';
          const userOnly = s.userInvocable === false ? chalk.yellow(' [model-only]') : '';
          logger.info(`  ${chalk.cyan(s.name.padEnd(max))}${desc}${modelBlock}${userOnly}`);
          if (s.triggers.length > 0) {
            logger.info(chalk.dim(`    triggers: ${s.triggers.join(', ')}`));
          }
          if (s.allowedTools && s.allowedTools.length > 0) {
            logger.info(chalk.dim(`    tools: ${s.allowedTools.join(', ')}`));
          }
        }
      }
      return { kind: 'handled' };
    }),
    builtin(
      'skill',
      'Load a skill by name and run it as a prompt',
      async (args, { globalOpts }) => {
        const parts = args.trim().split(/\s+/);
        const skillName = parts[0];
        const skillArgs = parts.slice(1).join(' ');
        if (!skillName) {
          logger.info(chalk.yellow('Usage: /skill <name> [arguments...]'));
          return { kind: 'handled' };
        }
        const root = resolveProjectRoot(globalOpts);
        const reg = createSkillRegistry();
        loadSkillsFromDisk(reg, root);
        const skill = reg.get(skillName);
        if (!skill) {
          logger.info(chalk.red(`Skill "${skillName}" not found.`));
          return { kind: 'handled' };
        }
        const { canUserInvoke, processSkillBody } = await import('../../skills/processor.js');
        if (!canUserInvoke(skill)) {
          logger.info(
            chalk.red(`Skill "${skillName}" is model-only and cannot be invoked by the user.`),
          );
          return { kind: 'handled' };
        }
        const processedBody = processSkillBody(skill.body, {
          arguments: skillArgs || undefined,
          sessionId: `user-${Date.now()}`,
          projectRoot: root,
        });
        return { kind: 'prompt', text: processedBody, mode: 'normal' };
      },
    ),
    builtin('hooks', 'List configured hooks', async (_args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const cfg = loadHookConfig(root);
      if (cfg.hooks.length === 0) {
        logger.info(chalk.dim('No hooks configured.'));
        logger.info(chalk.dim('  Add entries to .spark/hooks/config.json.'));
      } else {
        for (const h of cfg.hooks) {
          const target = h.command ?? `${h.script?.interpreter} ${h.script?.path}`;
          const tools = h.tools && h.tools.length > 0 ? ` [${h.tools.join(',')}]` : '';
          const blk = h.blocking ? chalk.yellow(' blocking') : '';
          logger.info(`  ${chalk.cyan(h.event)}${tools}${blk}  ${chalk.dim(target)}`);
        }
      }
      return { kind: 'handled' };
    }),
    builtin('memory', 'Show project + session memory', async (_args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const project = getProjectMemory(root);
      const session = getSessionMemory(root);
      if (project.entries.length === 0 && session.entries.length === 0) {
        logger.info(chalk.dim('No memory entries.'));
      } else {
        if (project.entries.length > 0) {
          logger.info(chalk.bold('Project memory:'));
          for (const e of project.entries) {
            logger.info(`  ${chalk.cyan(e.key)}  ${e.value}`);
          }
        }
        if (session.entries.length > 0) {
          logger.info(chalk.bold('Session memory:'));
          for (const e of session.entries) {
            logger.info(`  ${chalk.cyan(e.key)}  ${e.value}`);
          }
        }
      }
      return { kind: 'handled' };
    }),
    builtin('replay', 'Show recent replay log entries', async (args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const path = join(getProjectSparkDir(root), 'replay-log.jsonl');
      if (!existsSync(path)) {
        logger.info(chalk.dim('No replay log yet.'));
        return { kind: 'handled' };
      }
      const n = Number.parseInt(args.trim(), 10);
      const tail = Number.isFinite(n) && n > 0 ? n : 20;
      const raw = readFileSync(path, 'utf8');
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const slice = lines.slice(-tail);
      for (const line of slice) {
        try {
          const evt = JSON.parse(line) as { ts?: string; type?: string };
          const ts = (evt.ts ?? '').slice(11, 19);
          logger.info(chalk.dim(ts), chalk.cyan(evt.type ?? '?'), chalk.dim(line));
        } catch {
          logger.info(chalk.dim(line));
        }
      }
      return { kind: 'handled' };
    }),
    builtin('bash', 'Execute a shell command (or use ! prefix)', async (args) => {
      const cmd = args.trim();
      if (!cmd) {
        logger.info(chalk.yellow('Usage: /bash <command>  (or type !<command> directly)'));
        return { kind: 'handled' };
      }
      return { kind: 'prompt', text: `!${cmd}`, mode: 'normal' };
    }),
  ];
}
