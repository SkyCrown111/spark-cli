/**
 * Config and UI built-in commands: model, effort, theme, tui, style,
 * keybindings, focus, fewer-permission-prompts, debug, feedback, wakeup.
 */

import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import type { SlashCommand } from '../registry.js';
import { runModelCurrent, runModelList, runModelUse } from '../../../commands/model.js';
import { setTheme, listThemes } from '../../../theme/theme.js';
import { builtin } from './types.js';

export function buildConfigCommands(): SlashCommand[] {
  return [
    builtin('model', 'Manage current model', async (args, { globalOpts }) => {
      const parts = args.split(/\s+/).filter(Boolean);
      if (parts[0] === 'list') {
        await runModelList(globalOpts, parts[1]);
        return { kind: 'handled' };
      } else if (parts[0] === 'use') {
        const ref = parts.slice(1).join(' ');
        if (!ref) logger.info(chalk.yellow('Usage: /model use provider/model'));
        else await runModelUse(globalOpts, ref);
        return { kind: 'handled' };
      } else if (parts.length === 0) {
        return { kind: 'state-show-model-picker' };
      } else {
        await runModelCurrent(globalOpts);
        return { kind: 'handled' };
      }
    }),
    builtin('effort', 'Set reasoning effort level (low|medium|high|xhigh|max)', async (args) => {
      const VALID_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
      const arg = args.trim().toLowerCase();
      if (!arg || !VALID_LEVELS.includes(arg as (typeof VALID_LEVELS)[number])) {
        logger.info(chalk.yellow(`Usage: /effort <level> where level = ${VALID_LEVELS.join('|')}`));
        return { kind: 'handled' };
      }
      logger.info(chalk.green(`Effort set to ${arg}.`));
      return { kind: 'state-set-effort', effortLevel: arg as (typeof VALID_LEVELS)[number] };
    }),
    builtin('theme', 'Switch theme (dark / light) or show current', async (args) => {
      const arg = args.trim().toLowerCase();
      if (!arg) {
        return { kind: 'state-show-theme-picker' };
      }
      if (setTheme(arg)) {
        logger.info(chalk.green(`Theme set to ${arg}.`));
        return { kind: 'handled' };
      }
      const available = listThemes().join(', ');
      logger.info(chalk.yellow(`Unknown theme "${arg}". Available: ${available}`));
      return { kind: 'handled' };
    }),
    builtin('tui', 'Renderer: default (scrollback) or fullscreen (alt screen)', async (args) => {
      const arg = args.trim().toLowerCase();
      if (!arg) {
        logger.info(chalk.dim('Usage: /tui default | /tui fullscreen'));
        logger.info(chalk.dim('  default — main screen + native scrollback (default)'));
        logger.info(chalk.dim('  fullscreen — alternate screen + in-app scroll/search'));
        return { kind: 'handled' };
      }
      if (arg !== 'default' && arg !== 'fullscreen') {
        logger.info(chalk.yellow(`Unknown renderer "${arg}". Use default or fullscreen.`));
        return { kind: 'handled' };
      }
      return { kind: 'state-set-renderer', renderer: arg };
    }),
    builtin('style', 'Set output style (concise|normal|verbose|emoji)', async (args) => {
      const style = args.trim().toLowerCase();
      const validStyles = ['concise', 'normal', 'verbose', 'emoji'];

      if (!style) {
        logger.info(chalk.cyan('Current output style:'), chalk.dim('normal'));
        logger.info(chalk.dim('Available styles: ' + validStyles.join(', ')));
        return { kind: 'handled' };
      }

      if (!validStyles.includes(style)) {
        logger.info(chalk.yellow(`Invalid style: ${style}`));
        logger.info(chalk.dim('Available styles: ' + validStyles.join(', ')));
        return { kind: 'handled' };
      }

      try {
        const { appState } = await import('../../../state/AppState.js');
        appState.setState((s) => ({
          messages: [
            ...s.messages,
            {
              role: 'assistant' as const,
              content: chalk.green(`Output style set to: ${style}`),
            },
          ],
        }));
      } catch {
        logger.info(chalk.green(`Output style set to: ${style}`));
      }
      return { kind: 'handled' };
    }),
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
        logger.info(chalk.yellow('Usage: /feedback <description of issue or suggestion>'));
        return { kind: 'handled' };
      }
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
        'Save the report to .spark/feedback/ directory with a timestamp filename.',
      ].join('\n');
      return { kind: 'prompt', text, mode: 'normal' };
    }),
    builtin('wakeup', 'Schedule a wake-up reminder', async (args) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        logger.info(
          chalk.yellow('Usage: /wakeup <delay> <message>  (e.g., /wakeup 5m check build)'),
        );
        logger.info(chalk.dim('Delays: 30s, 5m, 1h, 2d'));
        return { kind: 'handled' };
      }

      const { scheduleWakeup, parseDelay, formatWakeup } = await import('../../agent/wakeup.js');
      const delayStr = parts[0];
      const message = parts.slice(1).join(' ');
      const delayMs = parseDelay(delayStr);

      if (delayMs === undefined) {
        logger.info(chalk.yellow(`Invalid delay: ${delayStr}. Use: 30s, 5m, 1h, 2d`));
        return { kind: 'handled' };
      }

      const entry = scheduleWakeup(message, delayMs);
      logger.info(chalk.green('Wake-up scheduled:'), formatWakeup(entry));
      return { kind: 'handled' };
    }),
  ];
}
