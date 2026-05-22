/**
 * Skill file watcher — detects changes to skill files and triggers reloads.
 *
 * Watches the skill directories for file changes (add, modify, delete)
 * and calls the provided callback when changes are detected.
 */

import { watch, type FSWatcher } from 'node:fs';
import { existsSync } from 'node:fs';
import { listSkillSourceRoots } from './loader.js';

export interface SkillWatcherOptions {
  /** Project root for resolving skill directories. */
  projectRoot: string;
  /** Called when skill files change. */
  onChange: () => void;
  /** Debounce interval in ms (default 500). */
  debounceMs?: number;
}

/**
 * Watch skill directories for changes. Returns a function to stop watching.
 */
export function watchSkillDirs(opts: SkillWatcherOptions): () => void {
  const roots = listSkillSourceRoots(opts.projectRoot);
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = opts.debounceMs ?? 500;

  const triggerChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      opts.onChange();
      debounceTimer = null;
    }, debounceMs);
  };

  for (const root of roots) {
    if (!existsSync(root.dir)) continue;
    try {
      const watcher = watch(root.dir, { recursive: true }, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          triggerChange();
        }
      });
      watchers.push(watcher);
    } catch {
      // Watch may fail on some systems; best-effort
    }
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const w of watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
  };
}
