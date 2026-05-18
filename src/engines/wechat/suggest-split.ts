import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findSceneFiles } from '../cocos/scene-list.js';

export interface SplitSuggestion {
  name: string;
  root: string;
  reason: string;
  estimatedAssets: string[];
}

/** Heuristic subpackage suggestions from assets/ layout and scenes. */
export function suggestWechatSplits(projectRoot: string): SplitSuggestion[] {
  const suggestions: SplitSuggestion[] = [];
  const scenes = findSceneFiles(projectRoot);

  const sceneDirs = new Set<string>();
  for (const scene of scenes) {
    const dir = scene.replace(/\/[^/]+$/, '');
    if (dir && dir !== 'assets') sceneDirs.add(dir);
  }

  for (const dir of sceneDirs) {
    const rel = dir.replace(/^assets\//, '');
    suggestions.push({
      name: rel.replace(/\//g, '_') || 'scenes',
      root: `subpackages/${rel}/`,
      reason: `Scene folder ${dir} can be a subpackage root`,
      estimatedAssets: listTopFiles(join(projectRoot, dir), 5),
    });
  }

  const bundles = ['assets/audio', 'assets/textures', 'assets/resources'];
  for (const bundle of bundles) {
    const full = join(projectRoot, bundle);
    if (!existsSync(full)) continue;
    const name = bundle.split('/').pop() ?? 'bundle';
    suggestions.push({
      name,
      root: `subpackages/${name}/`,
      reason: `Large asset folder ${bundle}`,
      estimatedAssets: listTopFiles(full, 5),
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      name: 'resources',
      root: 'subpackages/resources/',
      reason: 'Default: move non-first-screen assets under subpackages/resources/',
      estimatedAssets: [],
    });
  }

  return suggestions;
}

function listTopFiles(dir: string, limit: number): string[] {
  if (!existsSync(dir)) return [];
  const files: { rel: string; size: number }[] = [];

  function walk(current: string) {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else files.push({ rel: relative(dir, full).replace(/\\/g, '/'), size: st.size });
    }
  }

  walk(dir);
  return files
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)
    .map((f) => f.rel);
}
