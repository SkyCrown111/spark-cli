/**
 * Git history suggestions — provides prompt suggestions based on recent git commits.
 *
 * Analyzes recent commit messages to suggest relevant prompts
 * that match the user's current input context.
 */

import { execSync } from 'node:child_process';

export interface GitSuggestion {
  /** Suggested text */
  value: string;
  /** Display label */
  label: string;
  /** Source (e.g., 'commit', 'branch') */
  source: string;
}

/**
 * Get recent git commit messages as suggestions.
 *
 * Returns the last N commit messages that can be used as
 * prompt suggestions or inspiration.
 */
export function getGitCommitSuggestions(projectRoot: string, maxResults = 5): GitSuggestion[] {
  try {
    // Get recent commit messages (one line each)
    const output = execSync(`git log --oneline -${maxResults} --format="%s"`, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const messages = output
      .trim()
      .split('\n')
      .filter((m) => m.length > 0);

    return messages.map((msg, i) => ({
      value: msg,
      label: msg.length > 60 ? msg.slice(0, 57) + '...' : msg,
      source: `commit-${i}`,
    }));
  } catch {
    // Not a git repo or git not available
    return [];
  }
}

/**
 * Get current branch name as a suggestion context.
 */
export function getGitBranchContext(projectRoot: string): string | undefined {
  try {
    return execSync('git branch --show-current', {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Get modified files as context for suggestions.
 */
export function getGitModifiedFiles(projectRoot: string, maxResults = 5): string[] {
  try {
    const output = execSync('git diff --name-only', {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

/**
 * Generate context-aware suggestions based on git state.
 *
 * Combines commit history, branch name, and modified files
 * to create relevant prompt suggestions.
 */
export function generateGitSuggestions(projectRoot: string, currentInput: string): GitSuggestion[] {
  const suggestions: GitSuggestion[] = [];
  const inputLower = currentInput.toLowerCase();

  // Get recent commits
  const commits = getGitCommitSuggestions(projectRoot, 10);

  // Filter commits that relate to current input
  if (currentInput.length > 2) {
    const relevant = commits.filter(
      (c) =>
        c.value.toLowerCase().includes(inputLower) ||
        inputLower.includes(c.value.toLowerCase().slice(0, 20)),
    );
    suggestions.push(...relevant.slice(0, 3));
  }

  // Add branch-based suggestion
  const branch = getGitBranchContext(projectRoot);
  if (branch && !currentInput) {
    suggestions.push({
      value: `Continue working on ${branch}`,
      label: `Continue working on ${branch}`,
      source: 'branch',
    });
  }

  // Add modified files suggestion
  const modified = getGitModifiedFiles(projectRoot, 3);
  if (modified.length > 0 && !currentInput) {
    suggestions.push({
      value: `Review changes to ${modified.join(', ')}`,
      label: `Review changes to ${modified.slice(0, 2).join(', ')}${modified.length > 2 ? '...' : ''}`,
      source: 'modified',
    });
  }

  return suggestions.slice(0, 5);
}
