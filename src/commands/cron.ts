/**
 * `spark-cli cron` — durable, file-based job scheduler.
 *
 * Subcommands:
 *   add <cron> <prompt...>   add a new job (5-field cron). Pass --once for
 *                            one-shot.
 *   list                     show all jobs with id, cron, lastRunAt, prompt.
 *   remove <id>              delete a job by id.
 *   tick                     run any jobs due now and exit. Recurring jobs are
 *                            kept; one-shot jobs are deleted after firing.
 *
 * Storage is `~/.spark-cli/cron.json`. Tick is intentionally fire-and-forget —
 * each due job spawns `spark-cli chat <prompt>` so the heavy lifting reuses the
 * normal one-shot pipeline. The cron command never imports the agent loop
 * directly; that keeps `tick` cheap and isolated.
 */

import { spawn } from 'node:child_process';
import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { SparkCLIError } from '../utils/errors.js';
import { addJob, listJobs, removeJob, markRan, type CronJob } from '../core/cron/store.js';
import { matches, parseCron, nextRun } from '../core/cron/parser.js';

function fmtTs(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

export async function runCronAdd(
  globals: GlobalOptions,
  opts: { cron: string; prompt: string; once?: boolean; ttlDays?: number },
): Promise<void> {
  resolveProjectRoot(globals);
  try { parseCron(opts.cron); }
  catch (e) { throw new SparkCLIError(`invalid cron: ${(e as Error).message}`); }
  const job = addJob({
    cron: opts.cron,
    prompt: opts.prompt,
    recurring: !opts.once,
    ttlDays: opts.ttlDays,
  });
  console.log(chalk.green('check'), `cron job ${chalk.cyan(job.id)} scheduled (${job.cron})`);
  console.log(`  next run: ${fmtTs(nextRun(parseCron(job.cron)).getTime())}`);
}

export async function runCronList(_globals: GlobalOptions): Promise<void> {
  const jobs = listJobs();
  if (jobs.length === 0) {
    console.log('(no cron jobs)');
    return;
  }
  for (const j of jobs) {
    const next = (() => { try { return fmtTs(nextRun(parseCron(j.cron)).getTime()); } catch { return '-'; } })();
    console.log(
      `${chalk.cyan(j.id)}  ${j.cron}  ${j.recurring ? 'recurring' : 'once'}  next=${next}  last=${fmtTs(j.lastRunAt)}`,
    );
    console.log(`    ${j.prompt}`);
  }
}

export async function runCronRemove(_globals: GlobalOptions, opts: { id: string }): Promise<void> {
  const ok = removeJob(opts.id);
  if (!ok) throw new SparkCLIError(`no cron job with id "${opts.id}"`);
  console.log(chalk.green('check'), `removed cron job ${opts.id}`);
}

export async function runCronTick(globals: GlobalOptions): Promise<void> {
  const projectRoot = resolveProjectRoot(globals);
  const now = new Date();
  now.setSeconds(0, 0);
  const jobs = listJobs();
  const due = jobs.filter((j) => matches(parseCron(j.cron), now) && j.lastRunAt !== now.getTime());
  if (due.length === 0) {
    console.log('(no jobs due)');
    return;
  }
  for (const j of due) {
    runOne(j, projectRoot);
    markRan(j.id, now.getTime());
  }
  console.log(chalk.green('check'), `dispatched ${due.length} cron job(s)`);
}

function runOne(job: CronJob, projectRoot: string): void {
  const argv1 = process.argv[1] ?? 'spark-cli';
  const args = [argv1, 'chat', job.prompt, '--project', projectRoot];
  const p = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  p.unref();
  console.log(chalk.dim('  -> dispatched:'), `chat <prompt> --project ${projectRoot}`);
}
