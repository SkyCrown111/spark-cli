/**
 * Session CLI subcommands: list, show, delete.
 *
 * Usage:
 *   spark-cli sessions list            — list all sessions for this project
 *   spark-cli sessions show <id>       — show session details
 *   spark-cli sessions delete <id>     — delete a session
 */

import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { listSessions, loadSession, deleteSession } from '../core/session/manager.js';

export async function runSessionsList(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const sessions = listSessions(root);
  if (sessions.length === 0) {
    logger.info(chalk.dim('No sessions found.'));
    return;
  }
  for (const s of sessions) {
    const updated = s.updatedAt.slice(0, 19).replace('T', ' ');
    const label = s.name || s.title || 'Untitled';
    logger.info(`  ${chalk.cyan(s.id)}  ${chalk.dim(updated)}  ${label}  ${chalk.dim(s.model)}`);
  }
}

export async function runSessionsShow(opts: GlobalOptions, id: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  const snapshot = loadSession(root, id);
  if (!snapshot) {
    logger.info(chalk.yellow(`Session ${id} not found.`));
    return;
  }
  logger.info(chalk.bold('Session:'), snapshot.id);
  if (snapshot.name) logger.info(chalk.bold('Name:'), snapshot.name);
  logger.info(chalk.bold('Title:'), snapshot.title || 'Untitled');
  logger.info(chalk.bold('Model:'), snapshot.model);
  logger.info(chalk.bold('Started:'), snapshot.startedAt);
  logger.info(chalk.bold('Updated:'), snapshot.updatedAt);
  logger.info(chalk.bold('Messages:'), snapshot.messages.length);
  logger.info(chalk.bold('History:'), snapshot.history.length);
  logger.info(chalk.bold('Write mode:'), snapshot.writeMode);
  logger.info(chalk.bold('Permission mode:'), snapshot.permissionMode);
  logger.info(chalk.bold('Effort level:'), snapshot.effortLevel);
  logger.info(chalk.bold('Always-allow:'), snapshot.alwaysAllowSet.join(', ') || '(none)');
  logger.info(chalk.bold('Plan phase:'), snapshot.plan.phase);
}

export async function runSessionsDelete(opts: GlobalOptions, id: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  if (deleteSession(root, id)) {
    logger.info(chalk.green(`Session ${id} deleted.`));
  } else {
    logger.info(chalk.yellow(`Session ${id} not found.`));
  }
}
