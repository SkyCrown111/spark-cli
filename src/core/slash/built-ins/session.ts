/**
 * Session management built-in commands: resume, exit-plan, export, branch,
 * rename, tag, search, cleanup, copy, context, add-dir, recap, sandbox.
 */

import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import type { SlashCommand } from '../registry.js';
import { resolveProjectRoot } from '../../../utils/output.js';
import { builtin } from './types.js';

export function buildSessionCommands(): SlashCommand[] {
  return [
    builtin('resume', 'Resume a previous session (list or by ID)', async (args) => {
      const arg = args.trim();
      if (!arg) {
        return { kind: 'state-show-session-picker' };
      }
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
        logger.info(chalk.yellow('Usage: /rename <name>'));
        return { kind: 'handled' };
      }
      return { kind: 'state-rename-session', name };
    }),
    builtin('tag', 'Add/remove tags on the current session', async (args, { globalOpts }) => {
      const root = resolveProjectRoot(globalOpts);
      const parts = args.trim().split(/\s+/);
      const action = parts[0];
      const tags = parts.slice(1);

      if (!action || tags.length === 0) {
        const { loadSession } = await import('../../session/manager.js');
        const { appState } = await import('../../../state/AppState.js');
        const sessionId = appState.getState().sessionId;
        const snapshot = sessionId ? loadSession(root, sessionId) : undefined;
        if (snapshot?.tags && snapshot.tags.length > 0) {
          logger.info(chalk.cyan('Session tags:'), snapshot.tags.join(', '));
        } else {
          logger.info(chalk.dim('No tags on current session. Usage: /tag add <tag1> [tag2] ...'));
        }
        return { kind: 'handled' };
      }

      const { addSessionTags, removeSessionTags } = await import('../../session/manager.js');
      const { appState } = await import('../../../state/AppState.js');
      const sessionId = appState.getState().sessionId;

      if (!sessionId) {
        logger.info(chalk.yellow('No active session.'));
        return { kind: 'handled' };
      }

      if (action === 'add') {
        addSessionTags(root, sessionId, tags);
        logger.info(chalk.green('Added tags:'), tags.join(', '));
      } else if (action === 'remove' || action === 'rm') {
        removeSessionTags(root, sessionId, tags);
        logger.info(chalk.green('Removed tags:'), tags.join(', '));
      } else {
        logger.info(chalk.yellow('Usage: /tag add|remove <tag1> [tag2] ...'));
      }
      return { kind: 'handled' };
    }),
    builtin('search', 'Search across all sessions', async (args, { globalOpts }) => {
      const query = args.trim();
      if (!query) {
        logger.info(chalk.yellow('Usage: /search <query>'));
        return { kind: 'handled' };
      }

      const root = resolveProjectRoot(globalOpts);
      const { searchSessions } = await import('../../session/manager.js');
      const results = searchSessions(root, query, 10);

      if (results.length === 0) {
        logger.info(chalk.dim(`No results for "${query}".`));
      } else {
        logger.info(chalk.cyan(`Found ${results.length} results for "${query}":`));
        for (const r of results) {
          logger.info(chalk.dim(`  [${r.session.title || r.session.id}]`), r.snippet);
        }
      }
      return { kind: 'handled' };
    }),
    builtin(
      'cleanup',
      'Clean up old sessions (dry run by default)',
      async (args, { globalOpts }) => {
        const root = resolveProjectRoot(globalOpts);
        const { cleanupSessions } = await import('../../session/manager.js');

        const parts = args.trim().split(/\s+/);
        const deleteMode = parts.includes('--delete') || parts.includes('-d');
        const maxAgeStr = parts.find((p) => p.startsWith('--age='))?.split('=')[1];
        const maxAgeDays = maxAgeStr ? parseInt(maxAgeStr, 10) : 30;

        const result = cleanupSessions(root, { maxAgeDays, deleteExpired: deleteMode });

        if (deleteMode) {
          logger.info(chalk.green(`Cleaned up ${result.deleted.length} sessions.`));
        } else {
          logger.info(chalk.cyan(`Found ${result.expired.length} sessions to clean up.`));
          if (result.expired.length > 0) {
            logger.info(chalk.dim('Run /cleanup --delete to actually remove them.'));
          }
        }
        return { kind: 'handled' };
      },
    ),
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
        logger.info(chalk.yellow('Usage: /add-dir <path>'));
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
  ];
}
