/**
 * PR operations via the `gh` CLI.
 *
 * Provides functions to create PRs, check PR status, and load PR context
 * (diff + comments) for agent consumption.
 */

import { execSync } from 'node:child_process';

export interface PrResult {
  url: string;
  number: number;
}

export interface PrStatus {
  status: string;
  url: string;
}

/**
 * Create a PR via `gh pr create`.
 *
 * @returns The PR URL and number.
 * @throws If `gh` is not available or the command fails.
 */
export function createPr(
  title: string,
  body: string,
  options?: { cwd?: string; base?: string },
): PrResult {
  const baseFlag = options?.base ? `--base ${JSON.stringify(options.base)}` : '';
  const cmd = `gh pr create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} ${baseFlag}`;
  const output = execSync(cmd, {
    cwd: options?.cwd ?? process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();

  // gh pr create outputs the URL on the last line
  const url = output.split('\n').pop() ?? output;
  const numberMatch = url.match(/\/pull\/(\d+)/);
  const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

  return { url, number };
}

/**
 * Get PR status via `gh pr view`.
 *
 * @returns The PR merge status and URL.
 * @throws If `gh` is not available or the PR doesn't exist.
 */
export function getPrStatus(
  number: number,
  options?: { cwd?: string },
): PrStatus {
  const cmd = `gh pr view ${number} --json state,url`;
  const output = execSync(cmd, {
    cwd: options?.cwd ?? process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();

  const data = JSON.parse(output) as { state?: string; url?: string };
  return {
    status: data.state ?? 'UNKNOWN',
    url: data.url ?? '',
  };
}

/**
 * Load PR context (diff + comments) for agent consumption.
 *
 * Combines the PR diff and review comments into a single string
 * that can be injected into the agent's context.
 */
export function loadPrContext(
  number: number,
  options?: { cwd?: string },
): string {
  const cwd = options?.cwd ?? process.cwd();
  const parts: string[] = [];

  // Get PR diff
  try {
    const diff = execSync(`gh pr diff ${number}`, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    parts.push(`## PR #${number} Diff\n\n${diff}`);
  } catch {
    parts.push(`## PR #${number} Diff\n\n(diff unavailable)`);
  }

  // Get PR comments
  try {
    const comments = execSync(
      `gh api repos/{owner}/{repo}/pulls/${number}/comments --jq '.[].body'`,
      { cwd, stdio: 'pipe', encoding: 'utf8' },
    );
    if (comments.trim()) {
      parts.push(`## PR #${number} Review Comments\n\n${comments}`);
    }
  } catch {
    // Comments may not be available
  }

  // Get PR issue comments
  try {
    const issueComments = execSync(
      `gh pr view ${number} --json comments --jq '.comments[].body'`,
      { cwd, stdio: 'pipe', encoding: 'utf8' },
    );
    if (issueComments.trim()) {
      parts.push(`## PR #${number} Comments\n\n${issueComments}`);
    }
  } catch {
    // Issue comments may not be available
  }

  return parts.join('\n\n');
}
