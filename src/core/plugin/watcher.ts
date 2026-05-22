/**
 * Plugin file watcher — detects changes to plugin files and triggers reloads.
 */

import { watch, type FSWatcher } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';

export interface PluginWatcherOptions {
  /** Project root for resolving plugin directory. */
  projectRoot: string;
  /** Called when plugin files change. */
  onChange: (pluginName: string) => void;
  /** Debounce interval in ms (default 500). */
  debounceMs?: number;
}

/**
 * Watch plugin directories for changes. Returns a function to stop watching.
 */
export function watchPluginDirs(opts: PluginWatcherOptions): () => void {
  const pluginsDir = join(getProjectSparkDir(opts.projectRoot), 'plugins');
  if (!existsSync(pluginsDir)) return () => {};

  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = opts.debounceMs ?? 500;

  const triggerChange = (pluginName: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      opts.onChange(pluginName);
      debounceTimer = null;
    }, debounceMs);
  };

  try {
    const watcher = watch(pluginsDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      // Extract plugin name from path (first directory segment)
      const parts = filename.split(/[/\\]/);
      if (parts.length >= 1) {
        triggerChange(parts[0]!);
      }
    });
    watchers.push(watcher);
  } catch {
    // Watch may fail on some systems; best-effort
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const w of watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
  };
}
