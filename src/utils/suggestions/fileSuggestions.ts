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
 * Filter file suggestions based on user input after @.
 *
 * Input is the partial filename after the @ symbol.
 */
export function filterFileSuggestions(
  suggestions: FileSuggestion[],
  input: string,
): FileSuggestion[] {
  if (!input) return suggestions.slice(0, 10);

  const lower = input.toLowerCase();

  return suggestions
    .filter((s) => s.label.toLowerCase().includes(lower))
    .sort((a, b) => {
      // Prioritize prefix matches and shorter paths
      const aPrefix = a.label.toLowerCase().startsWith(lower) ? 0 : 1;
      const bPrefix = b.label.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.label.length - b.label.length;
    })
    .slice(0, 10);
}