import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { loadMergedConfig } from '../config/load.js';
import { acquireStagingLock, releaseStagingLock } from '../core/staging/locks.js';
import { runAgentTurnForCli } from '../core/agent/run-turn.js';
import { startBackgroundAgent } from '../core/agent/background-agent.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { logger } from '../utils/logger.js';

interface FarmNode {
  id: string;
  prompt: string;
  depends_on?: string[];
  lock_paths?: string[];
  bg?: boolean;
}

interface FarmPlan {
  nodes: FarmNode[];
}

function parseFarmYaml(text: string): FarmPlan {
  const nodes: FarmNode[] = [];
  let cur: FarmNode | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('- id:')) {
      if (cur) nodes.push(cur);
      cur = { id: t.slice(5).trim(), prompt: '' };
    } else if (cur && t.startsWith('prompt:')) {
      cur.prompt = t.slice(7).trim();
    } else if (cur && t.startsWith('depends_on:')) {
      cur.depends_on = t
        .slice(11)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (cur && t.startsWith('lock_paths:')) {
      cur.lock_paths = t
        .slice(11)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (cur && t.startsWith('bg:')) {
      cur.bg = t.slice(3).trim().toLowerCase() === 'true';
    }
  }
  if (cur) nodes.push(cur);
  return { nodes };
}

export async function runAgentFarm(opts: GlobalOptions, planPath: string): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const abs = join(root, planPath);
  if (!existsSync(abs)) {
    logger.error(chalk.red(`Plan not found: ${planPath}`));
    return 1;
  }
  const plan = parseFarmYaml(readFileSync(abs, 'utf8'));
  const done = new Set<string>();
  const results: Record<string, unknown> = {};

  const ready = () =>
    plan.nodes.filter((n) => !done.has(n.id) && (n.depends_on ?? []).every((d) => done.has(d)));

  while (done.size < plan.nodes.length) {
    const batch = ready();
    if (batch.length === 0) {
      logger.error(chalk.red('Cycle or missing dependency in farm plan'));
      return 1;
    }
    await Promise.all(
      batch.map(async (node) => {
        const owner = `farm-${node.id}`;
        const locks = node.lock_paths ?? [];
        if (locks.length) acquireStagingLock(root, locks, owner);
        try {
          if (node.bg) {
            // Background mode: spawn detached process and record the agent ID
            const { id: bgId } = await startBackgroundAgent({
              projectRoot: root,
              prompt: node.prompt,
            });
            results[node.id] = {
              background: true,
              agentId: bgId,
              preview: `Background agent ${bgId} started`,
            };
          } else {
            const r = await runAgentTurnForCli({
              globalOpts: opts,
              history: [],
              userInput: node.prompt,
              writeMode: 'staging',
              mode: 'normal',
              agentId: owner,
              configOverride: config,
            });
            results[node.id] = {
              iterations: r.iterations,
              preview: (r.finalContent ?? '').slice(0, 200),
            };
          }
        } finally {
          if (locks.length) releaseStagingLock(root, owner);
        }
        done.add(node.id);
      }),
    );
  }

  if (opts.json) {
    printJson({ ok: true, results });
    return 0;
  }
  logger.info(chalk.green(`✓ Farm completed ${plan.nodes.length} node(s)`));
  return 0;
}
