/**
 * File suggestions — data source for @-reference file autocomplete.
 *
 * Scans the project directory for files that can be referenced
 * with @filename syntax in the chat input.
 */

import fs from 'fs';
import path from 'path';

export interface FileSuggestion {
  /** Full file path (relative to project root) */
  value: string;
  /** Display name (just filename or relative path) */
  label: string;
  /** File extension */
  extension: string;
}

/**
 * Get file suggestions from the project directory.
 *
 * Scans recursively but limits depth and count for performance.
 * Ignores common directories like node_modules, .git, dist, etc.
 */
export function getFileSuggestions(
  projectRoot: string,
  maxDepth = 3,
  maxResults = 20,
): FileSuggestion[] {
  const ignoreDirs = [
    'node_modules', '.git', '.spark-cli', 'dist', 'build',
    '.next', '.nuxt', 'coverage', '__pycache__', '.vscode',
    '.idea', 'target', '.cache', '.tmp',
  ];

  const results: FileSuggestion[] = [];

  function scan(dir: string, depth: number): void {
    if (depth > maxDepth || results.length >= maxResults) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (ignoreDirs.includes(entry.name) || entry.name.startsWith('.')) {
            continue;
          }
          scan(fullPath, depth + 1);
        } else if (entry.isFile()) {
          // Skip hidden files and very large files
          if (entry.name.startsWith('.')) continue;

          const relativePath = path.relative(projectRoot, fullPath);
          const ext = path.extname(entry.name);

          results.push({
            value: relativePath,
            label: relativePath,
            extension: ext,
          });
        }
      }
    } catch {
      // Directory may not be readable — skip silently
    }
  }

  scan(projectRoot, 0);
  return results;
}

/**
 * Fuzzy match: checks if all characters of `pattern` appear
 * in `text` in order. Returns a score or -1 for no match.
 */
function fuzzyScore(pattern: string, text: string): number {
  if (!pattern) return 1;

  const pLower = pattern.toLowerCase();
  const tLower = text.toLowerCase();

  let pi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < tLower.length && pi < pLower.length; ti++) {
    if (tLower[ti] === pLower[pi]) {
      score += 1;
      if (lastMatchIndex === ti - 1) score += 2;
      if (ti === 0 || tLower[ti - 1] === '/' || tLower[ti - 1] === '-' || tLower[ti - 1] === '_') {
        score += 3;
      }
      lastMatchIndex = ti;
      pi++;
    }
  }

  if (pi < pLower.length) return -1;
  score += Math.max(0, 20 - tLower.length);
  return score;
}

/**
 * Filter file suggestions based on user input after @.
 *
 * Uses fuzzy matching: characters must appear in order but
 * don't need to be contiguous. Path separator and word boundary
 * matches score higher.
 */
export function filterFileSuggestions(
  suggestions: FileSuggestion[],
  input: string,
): FileSuggestion[] {
  if (!input) return suggestions.slice(0, 10);

  return suggestions
    .map((s) => ({
      suggestion: s,
      score: fuzzyScore(input, s.label),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => s.suggestion);
}