/**
 * `spark-cli worktree` — thin wrappers around `git worktree`.
 *
 * Why we keep this in-tree instead of letting users shell out:
 * - Default placement under `.spark/worktrees/` so the directories are
 *   gitignored alongside other spark-cli state.
 * - `--branch` defaults to a deterministic name so subsequent `spark-cli
 *   worktree remove` cleans up both the directory and the branch.
 * - `spark-cli worktree list` includes the slug for each worktree so the agent
 *   can map them to memory keys.
 *
 * This command intentionally refuses to run inside a non-git project — there
 * is no engine-specific worktree story for projects that aren't versioned.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { getProjectSparkDir } from '../config/paths.js';
import { SparkCLIError } from '../utils/errors.js';

function isGitRepo(cwd: string): boolean {
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return r.status === 0 && r.stdout.trim() === 'true';
}

function gitTopLevel(cwd: string): string {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) throw new SparkCLIError('not a git repository');
  return r.stdout.trim();
}

function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, out: r.stdout, err: r.stderr };
}

function defaultWorktreesDir(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'worktrees');
}

function safeName(input: string): string {
  return (
    input
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'wt'
  );
}

export async function runWorktreeAdd(
  globals: GlobalOptions,
  opts: { name: string; branch?: string; base?: string },
): Promise<void> {
  const projectRoot = resolveProjectRoot(globals);
  if (!isGitRepo(projectRoot)) throw new SparkCLIError('worktree add requires a git project');
  const top = gitTopLevel(projectRoot);
  const name = safeName(opts.name);
  const dir = join(defaultWorktreesDir(top), name);
  if (existsSync(dir)) throw new SparkCLIError(`worktree directory already exists: ${dir}`);
  const branch = opts.branch ?? `spark/wt-${name}`;
  const base = opts.base ?? 'HEAD';
  mkdirSync(defaultWorktreesDir(top), { recursive: true });

  const exists = git(top, ['rev-parse', '--verify', '--quiet', branch]).ok;
  const args = exists
    ? ['worktree', 'add', dir, branch]
    : ['worktree', 'add', '-b', branch, dir, base];
  const r = git(top, args);
  if (!r.ok) throw new SparkCLIError(`git worktree add failed: ${r.err.trim() || r.out.trim()}`);
  logger.info(
    chalk.green('✓'),
    `worktree at ${chalk.cyan(relative(top, dir) || dir)} on branch ${chalk.cyan(branch)}`,
  );
}

export async function runWorktreeList(globals: GlobalOptions): Promise<void> {
  const projectRoot = resolveProjectRoot(globals);
  if (!isGitRepo(projectRoot)) throw new SparkCLIError('worktree list requires a git project');
  const top = gitTopLevel(projectRoot);
  const r = git(top, ['worktree', 'list', '--porcelain']);
  if (!r.ok) throw new SparkCLIError(r.err.trim() || 'git worktree list failed');
  const blocks = r.out.split(/\r?\n\r?\n/).filter((b) => b.trim().length > 0);
  for (const block of blocks) {
    const map: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const [k, ...rest] = line.split(' ');
      if (k) map[k] = rest.join(' ');
    }
    const path = map.worktree ?? '';
    const branch = map.branch ?? '(detached)';
    const head = (map.HEAD ?? '').slice(0, 8);
    logger.info(`${chalk.cyan(path)}\n  branch=${branch} head=${head}`);
  }
}

export async function runWorktreeRemove(
  globals: GlobalOptions,
  opts: { name: string; force?: boolean; deleteBranch?: boolean },
): Promise<void> {
  const projectRoot = resolveProjectRoot(globals);
  if (!isGitRepo(projectRoot)) throw new SparkCLIError('worktree remove requires a git project');
  const top = gitTopLevel(projectRoot);
  const name = safeName(opts.name);
  const dir = resolve(join(defaultWorktreesDir(top), name));
  // Tighten the path check so a malicious `--name=../etc/passwd` can't delete
  // anything outside `.spark/worktrees/`.
  if (!dir.startsWith(resolve(defaultWorktreesDir(top)) + sep)) {
    throw new SparkCLIError(`refusing to remove path outside .spark/worktrees: ${dir}`);
  }
  if (!existsSync(dir)) throw new SparkCLIError(`worktree not found: ${dir}`);
  const args = ['worktree', 'remove', ...(opts.force ? ['--force'] : []), dir];
  const r = git(top, args);
  if (!r.ok) {
    // Fall back to scrubbing the directory + `git worktree prune` if the
    // working tree is missing/dirty and force was set.
    if (opts.force) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      git(top, ['worktree', 'prune']);
    } else {
      throw new SparkCLIError(`git worktree remove failed: ${r.err.trim() || r.out.trim()}`);
    }
  }
  if (opts.deleteBranch) {
    const branch = `spark/wt-${name}`;
    git(top, ['branch', '-D', branch]);
  }
  logger.info(chalk.green('✓'), `removed worktree ${name}`);
}
