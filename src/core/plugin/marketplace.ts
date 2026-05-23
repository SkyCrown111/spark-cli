/**
 * Plugin marketplace — local index of available plugins.
 *
 * Reads from `~/.spark/plugin-index.json` or a bundled index.
 * Provides discovery, search, and metadata for available plugins.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGlobalConfigDir } from '../../config/paths.js';

export interface PluginIndexEntry {
  name: string;
  version: string;
  description?: string;
  author?: string;
  repository?: string;
  engines?: string[];
  keywords?: string[];
}

export interface PluginIndex {
  plugins: PluginIndexEntry[];
  updatedAt?: string;
}

function indexPath(): string {
  return join(getGlobalConfigDir(), 'plugin-index.json');
}

/**
 * Load the local plugin index.
 */
export function loadPluginIndex(): PluginIndex {
  const path = indexPath();
  if (!existsSync(path)) return { plugins: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PluginIndex;
  } catch {
    return { plugins: [] };
  }
}

/**
 * Search plugins by keyword.
 */
export function searchPlugins(query: string): PluginIndexEntry[] {
  const index = loadPluginIndex();
  const lower = query.toLowerCase();
  return index.plugins.filter((p) => {
    if (p.name.toLowerCase().includes(lower)) return true;
    if (p.description?.toLowerCase().includes(lower)) return true;
    if (p.keywords?.some((k) => k.toLowerCase().includes(lower))) return true;
    return false;
  });
}

/**
 * Get a specific plugin from the index.
 */
export function getPluginInfo(name: string): PluginIndexEntry | undefined {
  const index = loadPluginIndex();
  return index.plugins.find((p) => p.name === name);
}
