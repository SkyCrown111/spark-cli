/**
 * Background agent management.
 *
 * Background agents run as separate OS processes (detached `spark-cli -p "prompt" --json`),
 * with their state persisted in `.spark/agents/<id>.json` and logs as JSONL in
 * `.spark/agents/<id>.log`.
 *
 * Unlike `sub-agent.ts` (in-process child agents), background agents survive the
 * parent session and can be inspected / attached to later.
 */

import { spawn } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getProjectSparkDir } from '../../config/paths.js';

// ── Types ──────────────────────────────────────────────────────

export type BackgroundAgentStatus = 'running' | 'completed' | 'error' | 'killed';

export interface BackgroundAgentMeta {
  id: string;
  name: string;
  prompt: string;
  model?: string;
  status: BackgroundAgentStatus;
  startedAt: string;
  endedAt?: string;
  pid: number;
  exitCode?: number | null;
}

export interface BackgroundAgentListItem {
  id: string;
  name: string;
  status: BackgroundAgentStatus;
  startedAt: string;
}

export interface StartBackgroundAgentOpts {
  projectRoot: string;
  prompt: string;
  model?: string;
  name?: string;
}

// ── Directory helpers ──────────────────────────────────────────

function agentsDir(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'agents');
}

function ensureAgentsDir(projectRoot: string): string {
  const dir = agentsDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function metaPath(projectRoot: string, id: string): string {
  return join(agentsDir(projectRoot), `${id}.json`);
}

function logPath(projectRoot: string, id: string): string {
  return join(agentsDir(projectRoot), `${id}.log`);
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Spawn a detached background agent process.
 *
 * Runs `spark-cli -p <prompt> --json` as a child process. Stdout/stderr are
 * captured into a JSONL log file. The agent metadata is written to a JSON file
 * so `listBackgroundAgents` can enumerate them across sessions.
 */
export async function startBackgroundAgent(
  opts: StartBackgroundAgentOpts,
): Promise<{ id: string }> {
  const dir = ensureAgentsDir(opts.projectRoot);
  const id = randomUUID().slice(0, 12);
  const name = opts.name ?? `bg-${id.slice(0, 6)}`;
  const startedAt = new Date().toISOString();

  // Find the spark-cli dist/cli.js relative to this module.
  // This file lives at src/core/agent/background-agent.ts (dev) or
  // dist/core/agent/background-agent.js (built), so going up 3 levels
  // lands at the project root where dist/cli.js exists after build.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const cliEntry = join(__dirname, '..', '..', '..', 'cli.js');

  const args = [cliEntry, '-p', opts.prompt, '--json', '-P', opts.projectRoot];
  if (opts.model) {
    args.push('-m', opts.model);
  }

  const logFd = join(dir, `${id}.log`);

  // Write initial metadata
  const meta: BackgroundAgentMeta = {
    id,
    name,
    prompt: opts.prompt,
    model: opts.model,
    status: 'running',
    startedAt,
    pid: 0, // updated after spawn
  };

  writeFileSync(metaPath(opts.projectRoot, id), JSON.stringify(meta, null, 2), 'utf8');

  // Spawn detached child
  const child = spawn('node', args, {
    cwd: opts.projectRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  meta.pid = child.pid ?? 0;
  writeFileSync(metaPath(opts.projectRoot, id), JSON.stringify(meta, null, 2), 'utf8');

  // Capture stdout + stderr into the log file as JSONL
  const logStream = openJsonlLog(logFd);

  child.stdout?.on('data', (chunk: Buffer) => {
    logStream({ stream: 'stdout', ts: Date.now(), data: chunk.toString('utf8') });
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    logStream({ stream: 'stderr', ts: Date.now(), data: chunk.toString('utf8') });
  });

  child.on('close', (code) => {
    const updated = readMeta(opts.projectRoot, id);
    if (updated) {
      updated.status = code === 0 ? 'completed' : 'error';
      updated.endedAt = new Date().toISOString();
      updated.exitCode = code;
      writeFileSync(metaPath(opts.projectRoot, id), JSON.stringify(updated, null, 2), 'utf8');
    }
    logStream({ stream: 'system', ts: Date.now(), data: `process exited with code ${code}` });
  });

  child.on('error', (err) => {
    const updated = readMeta(opts.projectRoot, id);
    if (updated) {
      updated.status = 'error';
      updated.endedAt = new Date().toISOString();
      writeFileSync(metaPath(opts.projectRoot, id), JSON.stringify(updated, null, 2), 'utf8');
    }
    logStream({ stream: 'system', ts: Date.now(), data: `spawn error: ${err.message}` });
  });

  // Unref so the parent can exit without waiting for the child
  child.unref();

  return { id };
}

/**
 * List all background agents for a project.
 */
export function listBackgroundAgents(projectRoot: string): BackgroundAgentListItem[] {
  const dir = agentsDir(projectRoot);
  if (!existsSync(dir)) return [];

  const results: BackgroundAgentListItem[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(dir, entry), 'utf8');
      const meta = JSON.parse(raw) as BackgroundAgentMeta;
      results.push({
        id: meta.id,
        name: meta.name,
        status: meta.status,
        startedAt: meta.startedAt,
      });
    } catch {
      // skip corrupted entries
    }
  }
  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Attach to a background agent: returns the full log output so far.
 */
export function attachToAgent(projectRoot: string, id: string): string {
  const meta = readMeta(projectRoot, id);
  if (!meta) {
    throw new Error(`Agent ${id} not found`);
  }
  const lp = logPath(projectRoot, id);
  if (!existsSync(lp)) {
    return `[no log file yet for agent ${id}]`;
  }
  return readFileSync(lp, 'utf8');
}

/**
 * Get agent logs, optionally tailed to the last N lines.
 */
export function getAgentLogs(projectRoot: string, id: string, tail?: number): string {
  const lp = logPath(projectRoot, id);
  if (!existsSync(lp)) {
    throw new Error(`No log file for agent ${id}`);
  }
  const content = readFileSync(lp, 'utf8');
  if (tail === undefined) return content;

  const lines = content.split('\n');
  const start = Math.max(0, lines.length - tail);
  return lines.slice(start).join('\n');
}

/**
 * Kill a running background agent by sending SIGTERM.
 */
export function killBackgroundAgent(projectRoot: string, id: string): boolean {
  const meta = readMeta(projectRoot, id);
  if (!meta || meta.status !== 'running') return false;
  try {
    process.kill(meta.pid, 'SIGTERM');
    meta.status = 'killed';
    meta.endedAt = new Date().toISOString();
    writeFileSync(metaPath(projectRoot, id), JSON.stringify(meta, null, 2), 'utf8');
    return true;
  } catch {
    // process may have already exited
    return false;
  }
}

// ── Internal helpers ───────────────────────────────────────────

function readMeta(projectRoot: string, id: string): BackgroundAgentMeta | null {
  const p = metaPath(projectRoot, id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as BackgroundAgentMeta;
  } catch {
    return null;
  }
}

function openJsonlLog(filePath: string): (entry: Record<string, unknown>) => void {
  return (entry: Record<string, unknown>) => {
    try {
      appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // best-effort logging
    }
  };
}
