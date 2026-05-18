/**
 * Built-in slash commands.
 *
 * These mirror the if-chain that lived in `shell.ts` before Phase 5. The
 * handlers return `SlashOutcome`s that the REPL acts on (`exit`, `enter-plan`,
 * `prompt`, etc.). Commands that mutate REPL-local state (history, write
 * mode) return a `kind: 'state-update'` outcome handled in `shell.ts`.
 *
 * Anything REPL-state related stays in `shell.ts` (the registry stays free of
 * the readline interface). For those commands, this module emits sentinel
 * outcomes and `shell.ts` translates them into state mutations.
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SlashCommand, SlashOutcome } from './registry.js';
import { runDiff, runApply, runRevert } from '../../commands/staging-cmd.js';
import { runDoctor } from '../../commands/doctor.js';
import { runValidate } from '../../commands/validate.js';
import { runInit } from '../../commands/init.js';
import {
  runModelCurrent,
  runModelList,
  runModelUse,
} from '../../commands/model.js';
import { refreshProjectContext } from '../agent/system-prompt.js';
import { resolveProjectRoot } from '../../utils/output.js';
import { createSkillRegistry } from '../skills/registry.js';
import { loadSkillsFromDisk } from '../skills/loader.js';
import { loadHookConfig } from '../hooks/config.js';
import { getProjectMemory, getSessionMemory } from '../memory/store.js';
import {
  buildAnimAgentPrompt,
  buildGenAgentPrompt,
  buildLevelAgentPrompt,
  buildUiAgentPrompt,
} from '../agent/task-prompts.js';

/**
 * Sentinel outcomes for REPL-internal state. The REPL recognizes these by
 * `kind` and translates them into state mutations. They live in this file so
 * the registry stays decoupled from `shell.ts`.
 */
export type StatefulOutcome =
  | { kind: 'state-clear-history' }
  | { kind: 'state-set-write-mode'; writeMode: 'staging' | 'direct' | 'toggle' }
  | { kind: 'state-show-status' }
  | { kind: 'state-compact-history' };

export type ExtendedOutcome = SlashOutcome | StatefulOutcome;

function builtin(
  name: string,
  description: string,
  handler: (
    args: string,
    opts: { globalOpts: import('../../utils/output.js').GlobalOptions },
  ) => Promise<ExtendedOutcome> | ExtendedOutcome,
): SlashCommand {
  return {
    name,
    description,
    source: 'builtin',
    handler: async (ctx) => {
      return (await handler(ctx.args, {
        globalOpts: ctx.globalOpts,
      })) as SlashOutcome;
    },
  };
}

export function buildBuiltinCommands(): SlashCommand[] {
  return [
    builtin('help', 'Show available commands', async () => {
      // The actual help renderer lives in shell.ts so it can list custom
      // commands too; we just signal handled.
      return { kind: 'handled' };
    }),
    builtin('exit', 'Exit the session', async () => ({ kind: 'exit' })),
    builtin('quit', 'Exit the session', async () => ({ kind: 'exit' })),
    builtin('clear', 'Clear conversation history', async () => {
      console.log(chalk.dim('Conversation cleared.'));
      return { kind: 'state-clear-history' };
    }),
    builtin('refresh', 'Re-scan project context', async (_args, { globalOpts }) => {
      refreshProjectContext(resolveProjectRoot(globalOpts));
      console.log(chalk.dim('Project context re-scanned.'));
      return { kind: 'handled' };
    }),
    builtin('auto', 'Toggle direct-write mode (on / off)', async (args) => {
      // The REPL translates this; we encode the desired mode if explicit.
      const arg = args.trim().toLowerCase();
      if (arg === 'on') {
        return { kind: 'state-set-write-mode', writeMode: 'direct' };
      }
      if (arg === 'off') {
        return { kind: 'state-set-write-mode', writeMode: 'staging' };
      }
      // Toggle: REPL handles by reading current mode.
      return { kind: 'state-set-write-mode', writeMode: 'toggle' };
    }),
    builtin('diff', 'Show staged diff', async (_args, { globalOpts }) => {
      runDiff(globalOpts);
      return { kind: 'handled' };
    }),
    builtin('apply', 'Apply staged changes', async (_args, { globalOpts }) => {
      runApply({ ...globalOpts, yes: true });
      return { kind: 'handled' };
    }),
    builtin('revert', 'Discard staging', async (_args, { globalOpts }) => {
      runRevert(globalOpts);
      return { kind: 'handled' };
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
    builtin('gen', 'Agent: generate code (optional type: component|system)', async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const type = parts[0] === 'component' || parts[0] === 'system' ? parts.shift() : undefined;
      const text = buildGenAgentPrompt(parts.join(' '), type);
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('ui', 'Agent: generate UI from description', async (args) => {
      return { kind: 'prompt', text: buildUiAgentPrompt(args.trim()), mode: 'normal' };
    }),
    builtin('level', 'Agent: level design (name + optional hint)', async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const name = parts.shift() ?? 'level1';
      return {
        kind: 'prompt',
        text: buildLevelAgentPrompt(name, parts.join(' ')),
        mode: 'normal',
      };
    }),
    builtin('anim', 'Agent: animation graph (name + optional spec)', async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const name = parts.shift() ?? 'character';
      return {
        kind: 'prompt',
        text: buildAnimAgentPrompt(name, parts.join(' ')),
        mode: 'normal',
      };
    }),
    builtin('model', 'Manage current model', async (args, { globalOpts }) => {
      const parts = args.split(/\s+/).filter(Boolean);
      if (parts[0] === 'list') {
        await runModelList(globalOpts, parts[1]);
      } else if (parts[0] === 'use') {
        const ref = parts.slice(1).join(' ');
        if (!ref) console.log(chalk.yellow('Usage: /model use provider/model'));
        else await runModelUse(globalOpts, ref);
      } else {
        await runModelCurrent(globalOpts);
      }
      return { kind: 'handled' };
    }),
    builtin('plan', 'Enter plan mode (read-only; review before apply)', async () => {
      return { kind: 'enter-plan' };
    }),
    builtin('status', 'Show token budget for the current session', async () => {
      // The actual rendering happens in shell.ts (it has the live history /
      // config / model). We only emit the sentinel; shell translates it.
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
        console.log(chalk.dim('No skills installed.'));
        console.log(
          chalk.dim('  Add one at .spark-cli/skills/<name>/SKILL.md.'),
        );
      } else {
        const max = Math.max(...skills.map((s) => s.name.length));
        for (const s of skills) {
          const desc = s.description ? ` — ${s.description}` : '';
          console.log(`  ${chalk.cyan(s.name.padEnd(max))}${desc}`);
          if (s.triggers.length > 0) {
            console.log(chalk.dim(`    triggers: ${s.triggers.join(', ')}`));
          }
          if (s.allowedTools && s.allowedTools.length > 0) {
            console.log(chalk.dim(`    tools: ${s.allowedTools.join(', ')}`));
          }
        }
      }
      return { kind: 'handled' };
    }),
    builtin('hooks', 'List configured hooks', async (_args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const cfg = loadHookConfig(root);
      if (cfg.hooks.length === 0) {
        console.log(chalk.dim('No hooks configured.'));
        console.log(chalk.dim('  Add entries to .spark-cli/hooks/config.json.'));
      } else {
        for (const h of cfg.hooks) {
          const target = h.command ?? `${h.script?.interpreter} ${h.script?.path}`;
          const tools = h.tools && h.tools.length > 0 ? ` [${h.tools.join(',')}]` : '';
          const blk = h.blocking ? chalk.yellow(' blocking') : '';
          console.log(`  ${chalk.cyan(h.event)}${tools}${blk}  ${chalk.dim(target)}`);
        }
      }
      return { kind: 'handled' };
    }),
    builtin('memory', 'Show project + session memory', async (_args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const project = getProjectMemory(root);
      const session = getSessionMemory(root);
      if (project.entries.length === 0 && session.entries.length === 0) {
        console.log(chalk.dim('No memory entries.'));
      } else {
        if (project.entries.length > 0) {
          console.log(chalk.bold('Project memory:'));
          for (const e of project.entries) {
            console.log(`  ${chalk.cyan(e.key)}  ${e.value}`);
          }
        }
        if (session.entries.length > 0) {
          console.log(chalk.bold('Session memory:'));
          for (const e of session.entries) {
            console.log(`  ${chalk.cyan(e.key)}  ${e.value}`);
          }
        }
      }
      return { kind: 'handled' };
    }),
    builtin('replay', 'Show recent replay log entries', async (args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const path = join(root, '.spark-cli', 'replay-log.jsonl');
      if (!existsSync(path)) {
        console.log(chalk.dim('No replay log yet.'));
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
          console.log(chalk.dim(ts), chalk.cyan(evt.type ?? '?'), chalk.dim(line));
        } catch {
          console.log(chalk.dim(line));
        }
      }
      return { kind: 'handled' };
    }),
    {
      name: 'exit-plan',
      description: 'Exit plan mode and (optionally) apply the proposed plan',
      source: 'builtin',
      handler: async (ctx) => {
        const arg = ctx.args.trim().toLowerCase();
        const approve = arg === 'y' || arg === 'yes' || arg === 'approve';
        return { kind: 'exit-plan', approve };
      },
    },
  ];
}
