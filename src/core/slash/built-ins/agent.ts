/**
 * Agent and code-review built-in commands: gen, ui, level, anim, goal,
 * run, verify, batch, btw, agents, code-review, security-review, review.
 */

import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import type { SlashCommand } from '../registry.js';
import { resolveProjectRoot } from '../../../utils/output.js';
import { createAgentRegistry } from '../../agents/registry.js';
import { loadAgentsFromDisk } from '../../agents/loader.js';
import {
  buildAnimAgentPrompt,
  buildGenAgentPrompt,
  buildLevelAgentPrompt,
  buildUiAgentPrompt,
} from '../../agent/task-prompts.js';
import { builtin } from './types.js';

export function buildAgentCommands(): SlashCommand[] {
  return [
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
        logger.info(chalk.yellow('Usage: /batch <instruction>'));
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
        logger.info(chalk.yellow('Usage: /btw <question>'));
        return { kind: 'handled' };
      }
      return {
        kind: 'prompt',
        text: `[OFF-RECORD QUESTION — do not add to conversation history]\n\n${question}`,
        mode: 'normal',
      };
    }),
    builtin('agents', 'List or switch custom agents', async (args, { globalOpts }) => {
      const arg = args.trim();
      const root = resolveProjectRoot(globalOpts);
      const registry = createAgentRegistry();
      loadAgentsFromDisk(registry, root);

      if (arg.startsWith('use ')) {
        const agentName = arg.slice(4).trim();
        if (!agentName) {
          logger.info(chalk.yellow('Usage: /agents use <name>'));
          return { kind: 'handled' };
        }
        const agent = registry.get(agentName);
        if (!agent) {
          logger.info(chalk.red(`Agent "${agentName}" not found.`));
          logger.info(
            chalk.dim(
              'Available agents: ' +
                registry
                  .list()
                  .map((a) => a.name)
                  .join(', ') || '(none)',
            ),
          );
          return { kind: 'handled' };
        }
        return { kind: 'state-set-agent', agentName: agent.name };
      }

      if (arg === 'off' || arg === 'clear' || arg === 'reset') {
        return { kind: 'state-set-agent', agentName: undefined };
      }

      const agents = registry.list();
      if (agents.length === 0) {
        logger.info(chalk.dim('No custom agents defined.'));
        logger.info(chalk.dim('Create one at: .spark/agents/<name>/AGENT.md'));
        return { kind: 'handled' };
      }
      logger.info(chalk.bold('Available agents:'));
      for (const a of agents) {
        const src = a.source === 'project' ? chalk.dim(' (project)') : chalk.dim(' (global)');
        const desc = a.description ? chalk.dim(` — ${a.description}`) : '';
        logger.info(`  ${chalk.cyan(a.name)}${src}${desc}`);
      }
      logger.info(chalk.dim('\nUse /agents use <name> to activate, /agents off to deactivate.'));
      return { kind: 'handled' };
    }),
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
        logger.info(chalk.yellow('Usage: /review <PR number or URL>'));
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
  ];
}
