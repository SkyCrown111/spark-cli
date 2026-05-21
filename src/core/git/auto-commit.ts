/**
 * Auto-commit support for SparkCLI.
 *
 * Generates descriptive commit messages from staging manifests and
 * runs `git add -A && git commit` with co-author attribution.
 */

import { execSync } from 'node:child_process';

const CO_AUTHOR = 'Co-Authored-By: SparkCLI <noreply@spark-cli.dev>';

/**
 * Generate a descriptive commit message from a staging manifest.
 *
 * Groups files by action (create/modify/delete) and produces a
 * conventional-commit-style message.
 */
export function generateCommitMessage(manifest: {
  files: Array<{ path: string; action: string }>;
}): string {
  const created = manifest.files.filter((f) => f.action === 'create');
  const modified = manifest.files.filter((f) => f.action === 'modify');
  const deleted = manifest.files.filter((f) => f.action === 'delete');

  const parts: string[] = [];

  if (created.length > 0) {
    if (created.length === 1) {
      parts.push(`add ${created[0].path}`);
    } else {
      parts.push(`add ${created.length} files`);
    }
  }

  if (modified.length > 0) {
    if (modified.length === 1) {
      parts.push(`update ${modified[0].path}`);
    } else {
      parts.push(`update ${modified.length} files`);
    }
  }

  if (deleted.length > 0) {
    if (deleted.length === 1) {
      parts.push(`remove ${deleted[0].path}`);
    } else {
      parts.push(`remove ${deleted.length} files`);
    }
  }

  const summary = parts.length > 0 ? parts.join(', ') : 'apply staged changes';

  // Build a short body listing all files
  const fileList = manifest.files.map((f) => `  ${f.action}: ${f.path}`).join('\n');

  return `chore: ${summary}\n\n${fileList}\n\n${CO_AUTHOR}`;
}

/**
 * Auto-commit all changes in the project root.
 *
 * Runs `git add -A && git commit -m <message>`.
 * Returns true on success, false on failure (e.g. nothing to commit).
 */
export function autoCommit(
  projectRoot: string,
  message: string,
): boolean {
  try {
    execSync('git add -A', { cwd: projectRoot, stdio: 'pipe' });
    execSync(`git commit -m ${JSON.stringify(message)}`, {
      cwd: projectRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    // Nothing to commit or git error
    return false;
  }
}
