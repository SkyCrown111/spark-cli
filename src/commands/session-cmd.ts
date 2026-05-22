/**
 * Session CLI subcommands: list, show, delete.
 *
 * Usage:
 *   spark-cli sessions list            — list all sessions for this project
 *   spark-cli sessions show <id>       — show session details
 *   spark-cli sessions delete <id>     — delete a session
 */

import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { listSessions, loadSession, deleteSession } from '../core/session/manager.js';

export async function runSessionsList(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const sessions = listSessions(root);
  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }
  for (const s of sessions) {
    const updated = s.updatedAt.slice(0, 19).replace('T', ' ');
    const label = s.name || s.title || 'Untitled';
    console.log(`  ${chalk.cyan(s.id)}  ${chalk.dim(updated)}  ${label}  ${chalk.dim(s.model)}`);
  }
}

export async function runSessionsShow(opts: GlobalOptions, id: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  const snapshot = loadSession(root, id);
  if (!snapshot) {
    console.log(chalk.yellow(`Session ${id} not found.`));
    return;
  }
  console.log(chalk.bold('Session:'), snapshot.id);
  if (snapshot.name) console.log(chalk.bold('Name:'), snapshot.name);
  console.log(chalk.bold('Title:'), snapshot.title || 'Untitled');
  console.log(chalk.bold('Model:'), snapshot.model);
  console.log(chalk.bold('Started:'), snapshot.startedAt);
  console.log(chalk.bold('Updated:'), snapshot.updatedAt);
  console.log(chalk.bold('Messages:'), snapshot.messages.length);
  console.log(chalk.bold('History:'), snapshot.history.length);
  console.log(chalk.bold('Write mode:'), snapshot.writeMode);
  console.log(chalk.bold('Permission mode:'), snapshot.permissionMode);
  console.log(chalk.bold('Effort level:'), snapshot.effortLevel);
  console.log(chalk.bold('Always-allow:'), snapshot.alwaysAllowSet.join(', ') || '(none)');
  console.log(chalk.bold('Plan phase:'), snapshot.plan.phase);
}

export async function runSessionsDelete(opts: GlobalOptions, id: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  if (deleteSession(root, id)) {
    console.log(chalk.green(`Session ${id} deleted.`));
  } else {
    console.log(chalk.yellow(`Session ${id} not found.`));
  }
}