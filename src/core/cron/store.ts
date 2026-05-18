/**
 * Durable cron job store under `~/.spark-cli/cron.json`.
 *
 * Each entry is `{ id, cron, prompt, recurring, createdAt, expiresAt? }`. The
 * scheduler is fired by `spark-cli cron tick` (or the in-REPL ticker) — there is
 * no daemon; the user is expected to run `tick` from a launchd / Task
 * Scheduler hook, or rely on the REPL being open.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getGlobalConfigDir } from '../../config/paths.js';
import { parseCron } from './parser.js';

export interface CronJob {
  id: string;
  cron: string;
  prompt: string;
  recurring: boolean;
  createdAt: number;
  expiresAt?: number;
  lastRunAt?: number;
}

interface CronFile {
  jobs: CronJob[];
}

function path(): string {
  return join(getGlobalConfigDir(), 'cron.json');
}

function load(): CronFile {
  const p = path();
  if (!existsSync(p)) return { jobs: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as CronFile;
  } catch {
    return { jobs: [] };
  }
}

function save(file: CronFile): void {
  const dir = getGlobalConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path(), JSON.stringify(file, null, 2), 'utf8');
}

export function listJobs(): CronJob[] {
  return load().jobs;
}

export function addJob(input: { cron: string; prompt: string; recurring?: boolean; ttlDays?: number }): CronJob {
  parseCron(input.cron); // throws on invalid cron
  const file = load();
  const recurring = input.recurring !== false;
  const job: CronJob = {
    id: randomUUID().slice(0, 8),
    cron: input.cron,
    prompt: input.prompt,
    recurring,
    createdAt: Date.now(),
    expiresAt: recurring && input.ttlDays
      ? Date.now() + input.ttlDays * 24 * 3600 * 1000
      : undefined,
  };
  file.jobs.push(job);
  save(file);
  return job;
}

export function removeJob(id: string): boolean {
  const file = load();
  const before = file.jobs.length;
  file.jobs = file.jobs.filter((j) => j.id !== id);
  if (file.jobs.length === before) return false;
  save(file);
  return true;
}

export function markRan(id: string, when: number): void {
  const file = load();
  const job = file.jobs.find((j) => j.id === id);
  if (!job) return;
  job.lastRunAt = when;
  if (!job.recurring) {
    file.jobs = file.jobs.filter((j) => j.id !== id);
  } else if (job.expiresAt && when >= job.expiresAt) {
    file.jobs = file.jobs.filter((j) => j.id !== id);
  }
  save(file);
}
