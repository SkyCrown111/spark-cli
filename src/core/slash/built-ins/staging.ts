/**
 * Staging and git built-in commands: diff, apply, revert, checkpoint, rewind.
 */

import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import type { SlashCommand } from '../registry.js';
import { runDiff, runApply, runRevert } from '../../../commands/staging-cmd.js';
import { resolveProjectRoot } from '../../../utils/output.js';
import { builtin } from './types.js';

export function buildStagingCommands(): SlashCommand[] {
  return [
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
    builtin('checkpoint', 'Create a git stash checkpoint', async (_args, { globalOpts }) => {
      const { createCheckpoint } = await import('../../git/checkpoint.js');
      const root = resolveProjectRoot(globalOpts);
      try {
        const cp = await createCheckpoint(root);
        logger.info(chalk.green('Checkpoint created:'), chalk.cyan(cp.id), chalk.dim(cp.timestamp));
        try {
          const { appState } = await import('../../../state/AppState.js');
          appState.setState({ checkpoint: { id: cp.id, timestamp: cp.timestamp } });
        } catch {
          /* CLI-only mode */
        }
        return { kind: 'handled' };
      } catch (e) {
        logger.error(chalk.red('Checkpoint failed:'), e instanceof Error ? e.message : String(e));
        return { kind: 'handled' };
      }
    }),
    builtin(
      'rewind',
      'Rewind to a checkpoint (last one if no ID given)',
      async (args, { globalOpts }) => {
        const { rewindToCheckpoint, listCheckpoints } = await import('../../git/checkpoint.js');
        const root = resolveProjectRoot(globalOpts);
        const arg = args.trim();
        const checkpoints = listCheckpoints(root);
        if (checkpoints.length === 0) {
          logger.info(chalk.dim('No checkpoints available.'));
          return { kind: 'handled' };
        }
        const targetId = arg || checkpoints[checkpoints.length - 1].id;
        try {
          const ok = await rewindToCheckpoint(root, targetId);
          if (ok) {
            logger.info(chalk.green('Rewound to checkpoint:'), chalk.cyan(targetId));
            try {
              const { appState } = await import('../../../state/AppState.js');
              appState.setState({ checkpoint: undefined });
            } catch {
              /* CLI-only mode */
            }
          } else {
            logger.info(chalk.yellow('Rewind failed — conflict or checkpoint not found.'));
          }
          return { kind: 'handled' };
        } catch (e) {
          logger.error(chalk.red('Rewind failed:'), e instanceof Error ? e.message : String(e));
          return { kind: 'handled' };
        }
      },
    ),
  ];
}
