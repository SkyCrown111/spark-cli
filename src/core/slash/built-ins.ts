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
import { setTheme, listThemes } from '../../theme/theme.js';
import { refreshProjectContext } from '../agent/system-prompt.js';
import { refreshProjectInstructions } from '../instructions/loader.js';
import { resolveProjectRoot } from '../../utils/output.js';
import { createSkillRegistry } from '../skills/registry.js';
import { loadSkillsFromDisk } from '../skills/loader.js';
import { loadHookConfig } from '../hooks/config.js';
import { getProjectMemory, getSessionMemory } from '../memory/store.js';
import { createAgentRegistry } from '../agents/registry.js';
import { loadAgentsFromDisk } from '../agents/loader.js';
import { loadMergedConfig } from '../../config/load.js';
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
  | { kind: 'state-compact-history' }
  | { kind: 'state-show-model-picker' }
  | { kind: 'state-show-theme-picker' }
  | { kind: 'state-set-effort'; effortLevel: import('../../state/AppState.js').EffortLevel }
  | { kind: 'state-resume-session'; sessionId?: string }
  | { kind: 'state-show-session-picker' }
  | { kind: 'state-export-session'; filename?: string }
  | { kind: 'state-branch-session'; name?: string }
  | { kind: 'state-rename-session'; name: string }
  // Phase 2: new stateful outcomes
  | { kind: 'state-set-goal'; condition?: string }
  | { kind: 'state-clear-goal' }
  | { kind: 'state-copy-replies'; count?: number }
  | { kind: 'state-show-context'; all?: boolean }
  | { kind: 'state-add-dir'; path: string }
  | { kind: 'state-toggle-sandbox' }
  | { kind: 'state-toggle-focus' }
  | { kind: 'state-scan-permissions' }
  | { kind: 'state-toggle-debug'; description?: string }
  | { kind: 'state-show-keybindings' }
  | { kind: 'state-show-agents' }
  | { kind: 'state-set-agent'; agentName?: string };

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
    builtin('refresh', 'Re-scan project context and instructions', async (_args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      refreshProjectContext(root);
      refreshProjectInstructions(root);
      console.log(chalk.dim('Project context and instructions re-scanned.'));
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
        return { kind: 'handled' };
      } else if (parts[0] === 'use') {
        const ref = parts.slice(1).join(' ');
        if (!ref) console.log(chalk.yellow('Usage: /model use provider/model'));
        else await runModelUse(globalOpts, ref);
        return { kind: 'handled' };
      } else if (parts.length === 0) {
        // No args: open interactive model picker (Ink UI) or show current (CLI)
        return { kind: 'state-show-model-picker' };
      } else {
        await runModelCurrent(globalOpts);
        return { kind: 'handled' };
      }
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
    builtin('effort', 'Set reasoning effort level (low|medium|high|xhigh|max)', async (args) => {
      const VALID_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
      const arg = args.trim().toLowerCase();
      if (!arg || !VALID_LEVELS.includes(arg as typeof VALID_LEVELS[number])) {
        console.log(chalk.yellow(`Usage: /effort <level> where level = ${VALID_LEVELS.join('|')}`));
        return { kind: 'handled' };
      }
      console.log(chalk.green(`Effort set to ${arg}.`));
      return { kind: 'state-set-effort', effortLevel: arg as typeof VALID_LEVELS[number] };
    }),
    builtin('theme', 'Switch theme (dark / light) or show current', async (args) => {
      const arg = args.trim().toLowerCase();
      if (!arg) {
        // No args: open interactive theme picker (Ink UI) or show current (CLI)
        return { kind: 'state-show-theme-picker' };
      }
      if (setTheme(arg)) {
        console.log(chalk.green(`Theme set to ${arg}.`));
        return { kind: 'handled' };
      }
      const available = listThemes().join(', ');
      console.log(chalk.yellow(`Unknown theme "${arg}". Available: ${available}`));
      return { kind: 'handled' };
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
          const modelBlock = s.disableModelInvocation ? chalk.yellow(' [model-blocked]') : '';
          const userOnly = s.userInvocable === false ? chalk.yellow(' [model-only]') : '';
          console.log(`  ${chalk.cyan(s.name.padEnd(max))}${desc}${modelBlock}${userOnly}`);
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
    builtin('skill', 'Load a skill by name and run it as a prompt', async (args, { globalOpts }) => {
      const parts = args.trim().split(/\s+/);
      const skillName = parts[0];
      const skillArgs = parts.slice(1).join(' ');
      if (!skillName) {
        console.log(chalk.yellow('Usage: /skill <name> [arguments...]'));
        return { kind: 'handled' };
      }
      const root = resolveProjectRoot(globalOpts);
      const reg = createSkillRegistry();
      loadSkillsFromDisk(reg, root);
      const skill = reg.get(skillName);
      if (!skill) {
        console.log(chalk.red(`Skill "${skillName}" not found.`));
        return { kind: 'handled' };
      }
      // Check user invocability
      const { canUserInvoke, processSkillBody } = await import('../skills/processor.js');
      if (!canUserInvoke(skill)) {
        console.log(chalk.red(`Skill "${skillName}" is model-only and cannot be invoked by the user.`));
        return { kind: 'handled' };
      }
      // Process the skill body with variable substitution
      const processedBody = processSkillBody(skill.body, {
        arguments: skillArgs || undefined,
        sessionId: `user-${Date.now()}`,
        projectRoot: root,
      });
      // Return as a prompt for the agent to execute
      return { kind: 'prompt', text: processedBody, mode: 'normal' };
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
    builtin('bash', 'Execute a shell command (or use ! prefix)', async (args) => {
      const cmd = args.trim();
      if (!cmd) {
        console.log(chalk.yellow('Usage: /bash <command>  (or type !<command> directly)'));
        return { kind: 'handled' };
      }
      // Return the command as a bash prompt so the REPL executes it
      return { kind: 'prompt', text: `!${cmd}`, mode: 'normal' };
    }),
    builtin('resume', 'Resume a previous session (list or by ID)', async (args) => {
      const arg = args.trim();
      if (!arg) {
        // Show session picker UI (Ink REPL handles rendering)
        return { kind: 'state-show-session-picker' };
      }
      // Resume specific session by ID
      return { kind: 'state-resume-session', sessionId: arg };
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
    builtin('checkpoint', 'Create a git stash checkpoint', async (_args, { globalOpts }) => {
      const { createCheckpoint } = await import('../git/checkpoint.js');
      const root = resolveProjectRoot(globalOpts);
      try {
        const cp = await createCheckpoint(root);
        console.log(chalk.green('Checkpoint created:'), chalk.cyan(cp.id), chalk.dim(cp.timestamp));
        // Update AppState if available
        try {
          const { appState } = await import('../../state/AppState.js');
          appState.setState({ checkpoint: { id: cp.id, timestamp: cp.timestamp } });
        } catch { /* CLI-only mode */ }
        return { kind: 'handled' };
      } catch (e) {
        console.error(chalk.red('Checkpoint failed:'), e instanceof Error ? e.message : String(e));
        return { kind: 'handled' };
      }
    }),
    builtin('rewind', 'Rewind to a checkpoint (last one if no ID given)', async (args, { globalOpts }) => {
      const { rewindToCheckpoint, listCheckpoints } = await import('../git/checkpoint.js');
      const root = resolveProjectRoot(globalOpts);
      const arg = args.trim();
      const checkpoints = listCheckpoints(root);
      if (checkpoints.length === 0) {
        console.log(chalk.dim('No checkpoints available.'));
        return { kind: 'handled' };
      }
      const targetId = arg || checkpoints[checkpoints.length - 1].id;
      try {
        const ok = await rewindToCheckpoint(root, targetId);
        if (ok) {
          console.log(chalk.green('Rewound to checkpoint:'), chalk.cyan(targetId));
          try {
            const { appState } = await import('../../state/AppState.js');
            appState.setState({ checkpoint: undefined });
          } catch { /* CLI-only mode */ }
        } else {
          console.log(chalk.yellow('Rewind failed — conflict or checkpoint not found.'));
        }
        return { kind: 'handled' };
      } catch (e) {
        console.error(chalk.red('Rewind failed:'), e instanceof Error ? e.message : String(e));
        return { kind: 'handled' };
      }
    }),
    builtin('export', 'Export conversation as plain text', async (args) => {
      const filename = args.trim() || undefined;
      return { kind: 'state-export-session', filename };
    }),
    builtin('branch', 'Create a branch (fork) of the current conversation', async (args) => {
      const name = args.trim() || undefined;
      return { kind: 'state-branch-session', name };
    }),
    builtin('rename', 'Rename the current session', async (args) => {
      const name = args.trim();
      if (!name) {
        console.log(chalk.yellow('Usage: /rename <name>'));
        return { kind: 'handled' };
      }
      return { kind: 'state-rename-session', name };
    }),

    // ── Phase 2: Code Review Commands ────────────────────────────
    builtin('code-review', 'Review staged diff for correctness (shallow|deep)', async (args) => {
      const level = args.trim().toLowerCase() || 'shallow';
      const depth = level === 'deep' ? 'thorough, line-by-line' : 'quick, high-level';
      const text = [
        `Perform a ${depth} code review of the currently staged changes.`,
        '',
        'Analyze the staged diff and report:',
        '1. **Bugs or logic errors** — anything that looks incorrect or fragile',
        '2. **Performance concerns** — unnecessary allocations, N+1 queries, etc.',
        '3. **Style & readability** — naming, structure, missing error handling',
        '',
        'Format each issue as:',
        '- [CRITICAL/WARNING/INFO] <file>:<line> — <description>',
        '',
        'If no issues found, say so explicitly.',
        `Review depth: ${level}`,
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('security-review', 'Analyze staged changes for security vulnerabilities', async () => {
      const text = [
        'Perform a security review of the currently staged changes.',
        '',
        'Check for:',
        '1. **OWASP Top 10** vulnerabilities (injection, XSS, broken auth, etc.)',
        '2. **Hardcoded secrets** — API keys, passwords, tokens in source',
        '3. **SQL injection** — unsanitized user input in queries',
        '4. **XSS** — unescaped user content rendered in HTML/templates',
        '5. **Path traversal** — user-controlled file paths without validation',
        '6. **Insecure dependencies** — known vulnerable packages',
        '7. **Logging sensitive data** — PII or credentials in log statements',
        '',
        'Format each finding as:',
        '- [HIGH/MEDIUM/LOW] <file>:<line> — <vulnerability type>: <description>',
        '',
        'If no issues found, say so explicitly.',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('review', 'Review a Pull Request locally (by number or URL)', async (args) => {
      const pr = args.trim();
      if (!pr) {
        console.log(chalk.yellow('Usage: /review <PR number or URL>'));
        return { kind: 'handled' };
      }
      const text = [
        `Review Pull Request ${pr} locally.`,
        '',
        'Steps:',
        `1. Use \`gh pr view ${pr}\` to get PR metadata (title, description, author)`,
        `2. Use \`gh pr diff ${pr}\` to get the full diff`,
        '3. Review each changed file for:',
        '   - Correctness and logic errors',
        '   - Code style and readability',
        '   - Test coverage gaps',
        '   - Potential regressions',
        '4. Check if the PR description matches the actual changes',
        '',
        'Output a structured review:',
        '- **Summary** — 1-2 sentence overview',
        '- **Issues** — numbered list with severity',
        '- **Suggestions** — improvements the author should consider',
        '- **Verdict** — APPROVE / REQUEST_CHANGES / COMMENT',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),

    // ── Phase 2: Agent Control Commands ──────────────────────────
    builtin('goal', 'Set a goal for the agent to achieve (or /goal clear)', async (args) => {
      const condition = args.trim();
      if (!condition || condition.toLowerCase() === 'clear') {
        return { kind: 'state-clear-goal' };
      }
      return { kind: 'state-set-goal', condition };
    }),
    builtin('run', 'Launch the app to verify recent changes', async () => {
      const text = [
        'Launch the application to verify the recent code changes work correctly.',
        '',
        'Steps:',
        '1. Detect the project type and find the appropriate start command (e.g., npm start, pnpm dev)',
        '2. Run the start command in the background',
        '3. Monitor the output for errors or warnings',
        '4. Confirm the app started successfully',
        '5. Report any issues found',
        '',
        'If the app fails to start, analyze the error output and suggest fixes.',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('verify', 'Run build and tests to confirm changes are correct', async () => {
      const text = [
        'Verify the current code changes by running the full build and test suite.',
        '',
        'Steps:',
        '1. Run the build command (pnpm build or equivalent)',
        '2. Run the test suite (pnpm test or equivalent)',
        '3. Report results:',
        '   - Build: PASS/FAIL with error details if failed',
        '   - Tests: X/Y passed, list any failures',
        '4. If anything fails, analyze the root cause and suggest fixes',
        '',
        'Be thorough — this is a gate check before committing.',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('batch', 'Execute a large instruction as parallel sub-tasks', async (args) => {
      const instruction = args.trim();
      if (!instruction) {
        console.log(chalk.yellow('Usage: /batch <instruction>'));
        return { kind: 'handled' };
      }
      const text = [
        `Execute the following as a batch operation, decomposing into independent sub-tasks where possible:`,
        '',
        instruction,
        '',
        'For each sub-task:',
        '1. Identify dependencies between tasks',
        '2. Execute independent tasks in parallel where possible',
        '3. Report progress for each sub-task',
        '4. Summarize overall results at the end',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('btw', 'Quick question that does not enter conversation history', async (args) => {
      const question = args.trim();
      if (!question) {
        console.log(chalk.yellow('Usage: /btw <question>'));
        return { kind: 'handled' };
      }
      // The REPL will handle this by running the question but not adding it to history
      return { kind: 'prompt', text: `[OFF-RECORD QUESTION — do not add to conversation history]\n\n${question}`, mode: 'normal' };
    }),

    // ── Phase 2: Session Management Commands ─────────────────────
    builtin('copy', 'Copy last N assistant replies to clipboard', async (args) => {
      const n = Number.parseInt(args.trim(), 10);
      const count = Number.isFinite(n) && n > 0 ? n : 1;
      return { kind: 'state-copy-replies', count };
    }),
    builtin('context', 'Visualize context window usage', async (args) => {
      const all = args.trim().toLowerCase() === 'all';
      return { kind: 'state-show-context', all };
    }),
    builtin('add-dir', 'Add an extra working directory to the session', async (args) => {
      const dir = args.trim();
      if (!dir) {
        console.log(chalk.yellow('Usage: /add-dir <path>'));
        return { kind: 'handled' };
      }
      return { kind: 'state-add-dir', path: dir };
    }),
    builtin('recap', 'Generate a one-line session summary', async () => {
      const text = [
        'Generate a single-line summary of this conversation session.',
        '',
        'Requirements:',
        '- Maximum 120 characters',
        '- Capture the main topic/goal of the session',
        '- Include key decisions or outcomes',
        '- Use concise, professional language',
        '',
        'Output ONLY the summary line, nothing else.',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('sandbox', 'Toggle sandbox mode (read-only vs read-write)', async () => {
      return { kind: 'state-toggle-sandbox' };
    }),

    // ── Phase 2: Config & UI Commands ────────────────────────────
    builtin('keybindings', 'Show keyboard shortcuts', async () => {
      return { kind: 'state-show-keybindings' };
    }),
    builtin('focus', 'Toggle focus view (show only latest prompt+response)', async () => {
      return { kind: 'state-toggle-focus' };
    }),
    builtin('fewer-permission-prompts', 'Scan history and auto-add allow rules', async () => {
      return { kind: 'state-scan-permissions' };
    }),
    builtin('debug', 'Enable debug logging for troubleshooting', async (args) => {
      const description = args.trim() || undefined;
      return { kind: 'state-toggle-debug', description };
    }),
    builtin('feedback', 'Submit feedback or report a bug', async (args) => {
      const report = args.trim();
      if (!report) {
        console.log(chalk.yellow('Usage: /feedback <description of issue or suggestion>'));
        return { kind: 'handled' };
      }
      // This will be handled as a prompt to the agent to format and submit feedback
      const text = [
        'The user wants to submit feedback. Format the following as a structured feedback report:',
        '',
        `Feedback: ${report}`,
        '',
        'Include:',
        '- Category (bug/feature/improvement/other)',
        '- Description',
        '- Steps to reproduce (if bug)',
        '- Expected behavior',
        '- Actual behavior',
        '',
        'Save the report to .spark-cli/feedback/ directory with a timestamp filename.',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),

    // ── Phase 5: Agent Commands ────────────────────────────────
    builtin('agents', 'List or switch custom agents', async (args, { globalOpts }) => {
      const arg = args.trim();
      const root = resolveProjectRoot(globalOpts);
      const registry = createAgentRegistry();
      loadAgentsFromDisk(registry, root);

      // `/agents use <name>` — switch to a specific agent
      if (arg.startsWith('use ')) {
        const agentName = arg.slice(4).trim();
        if (!agentName) {
          console.log(chalk.yellow('Usage: /agents use <name>'));
          return { kind: 'handled' };
        }
        const agent = registry.get(agentName);
        if (!agent) {
          console.log(chalk.red(`Agent "${agentName}" not found.`));
          console.log(chalk.dim('Available agents: ' + registry.list().map((a) => a.name).join(', ') || '(none)'));
          return { kind: 'handled' };
        }
        return { kind: 'state-set-agent', agentName: agent.name };
      }

      // `/agents off` — disable custom agent
      if (arg === 'off' || arg === 'clear' || arg === 'reset') {
        return { kind: 'state-set-agent', agentName: undefined };
      }

      // `/agents` — list available agents
      const agents = registry.list();
      if (agents.length === 0) {
        console.log(chalk.dim('No custom agents defined.'));
        console.log(chalk.dim('Create one at: .spark-cli/agents/<name>/AGENT.md'));
        return { kind: 'handled' };
      }
      console.log(chalk.bold('Available agents:'));
      for (const a of agents) {
        const src = a.source === 'project' ? chalk.dim(' (project)') : chalk.dim(' (global)');
        const desc = a.description ? chalk.dim(` — ${a.description}`) : '';
        console.log(`  ${chalk.cyan(a.name)}${src}${desc}`);
      }
      console.log(chalk.dim('\nUse /agents use <name> to activate, /agents off to deactivate.'));
      return { kind: 'handled' };
    }),

    // ── Phase 6: MCP Commands ──────────────────────────────────
    builtin('mcp', 'MCP server management and status', async (args, { globalOpts }) => {
      const arg = args.trim().toLowerCase();
      const root = resolveProjectRoot(globalOpts);
      const config = await loadMergedConfig(root);
      const servers = config.mcp?.servers ?? [];

      if (arg === 'list' || arg === '' || arg === 'status') {
        if (servers.length === 0) {
          console.log(chalk.dim('No MCP servers configured.'));
          console.log(chalk.dim('Add servers in spark-cli.config.yaml or .mcp.json'));
          return { kind: 'handled' };
        }
        console.log(chalk.bold('MCP Servers:'));
        for (const s of servers) {
          const status = s.enabled === false ? chalk.red('disabled') : chalk.green('enabled');
          const transport = chalk.cyan(s.transport);
          const target = s.transport === 'stdio'
            ? s.command ?? '(no command)'
            : s.url ?? '(no url)';
          console.log(`  ${chalk.bold(s.name)}  [${transport}]  ${status}`);
          console.log(`    ${chalk.dim(target)}`);
        }
        return { kind: 'handled' };
      }

      // `/mcp tools` — list all MCP tools
      if (arg === 'tools') {
        try {
          const { connectMcpClients } = await import('../../mcp/client-pool.js');
          const { pool, tools } = await connectMcpClients(config, root);
          if (tools.length === 0) {
            console.log(chalk.dim('No MCP tools discovered.'));
          } else {
            console.log(chalk.bold(`MCP Tools (${tools.length}):`));
            for (const t of tools) {
              const ro = t.planModeAllowed ? chalk.dim(' (read-only)') : chalk.yellow(' (write)');
              console.log(`  ${chalk.cyan(t.name)}${ro}`);
              if (t.description) {
                console.log(`    ${chalk.dim(t.description.slice(0, 100))}`);
              }
            }
          }
          await pool.disconnectAll().catch(() => {});
        } catch (e) {
          console.log(chalk.red(`Failed to connect: ${(e as Error).message}`));
        }
        return { kind: 'handled' };
      }

      // `/mcp add <name> <command> [args...]` — quick-add a stdio server
      if (arg.startsWith('add ')) {
        const parts = arg.slice(4).trim().split(/\s+/);
        const name = parts[0];
        const command = parts[1];
        if (!name || !command) {
          console.log(chalk.yellow('Usage: /mcp add <name> <command> [args...]'));
          return { kind: 'handled' };
        }
        const serverConfig: import('../../config/schema.js').McpServerConfig = {
          name,
          transport: 'stdio',
          command,
          args: parts.slice(2),
          enabled: true,
        };
        const { writeProjectConfigYaml } = await import('../../config/load.js');
        if (!config.mcp) config.mcp = {};
        if (!config.mcp.servers) config.mcp.servers = [];
        const existingIdx = config.mcp.servers.findIndex((s) => s.name === name);
        if (existingIdx >= 0) {
          config.mcp.servers[existingIdx] = serverConfig;
        } else {
          config.mcp.servers.push(serverConfig);
        }
        await writeProjectConfigYaml(root, config);
        console.log(chalk.green(`Added MCP server "${name}" (${command}).`));
        return { kind: 'handled' };
      }

      // `/mcp remove <name>` — remove a server
      if (arg.startsWith('remove ') || arg.startsWith('rm ')) {
        const name = (arg.startsWith('remove ') ? arg.slice(7) : arg.slice(3)).trim();
        if (!name) {
          console.log(chalk.yellow('Usage: /mcp remove <name>'));
          return { kind: 'handled' };
        }
        const { writeProjectConfigYaml } = await import('../../config/load.js');
        const servers = config.mcp?.servers ?? [];
        const idx = servers.findIndex((s) => s.name === name);
        if (idx < 0) {
          console.log(chalk.red(`MCP server "${name}" not found.`));
          return { kind: 'handled' };
        }
        servers.splice(idx, 1);
        if (!config.mcp) config.mcp = {};
        config.mcp.servers = servers;
        await writeProjectConfigYaml(root, config);
        console.log(chalk.green(`Removed MCP server "${name}".`));
        return { kind: 'handled' };
      }

      // `/mcp test <name>` — test connectivity
      if (arg.startsWith('test ')) {
        const name = arg.slice(5).trim();
        if (!name) {
          console.log(chalk.yellow('Usage: /mcp test <name>'));
          return { kind: 'handled' };
        }
        const server = servers.find((s) => s.name === name);
        if (!server) {
          console.log(chalk.red(`MCP server "${name}" not found.`));
          return { kind: 'handled' };
        }
        console.log(chalk.dim(`Connecting to "${name}" (${server.transport})...`));
        try {
          const { connectToServer, disconnectClient } = await import('../../mcp/client.js');
          const conn = await connectToServer(server);
          console.log(chalk.green(`Connected. ${conn.tools.length} tools discovered.`));
          await disconnectClient(conn);
        } catch (e) {
          console.log(chalk.red(`Failed: ${(e as Error).message}`));
        }
        return { kind: 'handled' };
      }

      console.log(chalk.dim('Usage: /mcp [list|tools|add|remove|test]'));
      return { kind: 'handled' };
    }),
  ];
}
