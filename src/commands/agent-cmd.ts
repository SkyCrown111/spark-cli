/**
 * Background agent CLI subcommands: list, attach, logs, kill.
 *
 * Usage:
 *   spark-cli agents list                 — list background agents
 *   spark-cli agents attach <id>          — attach to a background agent (show output)
 *   spark-cli agents logs <id> [--tail N]  — show agent logs
 *   spark-cli agents kill <id>            — kill a running background agent
 */

import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot, printJson } from '../utils/output.js';
import {
  listBackgroundAgents,
  attachToAgent,
  getAgentLogs,
  killBackgroundAgent,
} from '../core/agent/background-agent.js';
import {
  loadAllAgentDefinitions,
} from '../core/agent/agent-defs.js';

export async function runAgentsList(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);

  // List running/historical background agents
  const agents = listBackgroundAgents(root);

  // Also list agent definitions from .spark-cli/agents/*.md
  const defs = loadAllAgentDefinitions(root);

  if (opts.json) {
    printJson({ agents, definitions: defs.map((d) => ({ name: d.name, model: d.model, bg: d.bg })) });
    return;
  }

  if (agents.length === 0 && defs.length === 0) {
    console.log(chalk.dim('No background agents or agent definitions found.'));
    return;
  }

  if (agents.length > 0) {
    console.log(chalk.bold('Background agents:'));
    for (const a of agents) {
      const statusColor =
        a.status === 'running'
          ? chalk.green
          : a.status === 'completed'
            ? chalk.dim
            : chalk.red;
      const started = a.startedAt.slice(0, 19).replace('T', ' ');
      console.log(
        `  ${chalk.cyan(a.id)}  ${a.name}  ${statusColor(a.status)}  ${chalk.dim(started)}`,
      );
    }
  }

  if (defs.length > 0) {
    if (agents.length > 0) console.log('');
    console.log(chalk.bold('Agent definitions:'));
    for (const d of defs) {
      const bgTag = d.bg ? chalk.yellow(' [bg]') : '';
      const modelTag = d.model ? chalk.dim(` (${d.model})`) : '';
      console.log(`  ${chalk.cyan(d.name)}${bgTag}${modelTag}`);
    }
  }
}

export async function runAgentAttach(
  opts: GlobalOptions,
  id: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  try {
    const output = attachToAgent(root, id);
    if (opts.json) {
      printJson({ id, output });
    } else {
      console.log(output);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      printJson({ error: msg });
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

export async function runAgentLogs(
  opts: GlobalOptions,
  id: string,
  tail?: number,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  try {
    const logs = getAgentLogs(root, id, tail);
    if (opts.json) {
      printJson({ id, logs });
    } else {
      console.log(logs);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      printJson({ error: msg });
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

export async function runAgentKill(
  opts: GlobalOptions,
  id: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const killed = killBackgroundAgent(root, id);
  if (opts.json) {
    printJson({ id, killed });
    return;
  }
  if (killed) {
    console.log(chalk.green(`Agent ${id} killed.`));
  } else {
    console.log(chalk.yellow(`Agent ${id} is not running or not found.`));
  }
}
