import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findSceneFiles } from '../../engines/cocos/scene-list.js';

export interface SceneIntegrityIssue {
  file: string;
  message: string;
  severity: 'error' | 'warn';
}

export function checkSceneIntegrity(projectRoot: string): SceneIntegrityIssue[] {
  const issues: SceneIntegrityIssue[] = [];
  const scenes = findSceneFiles(projectRoot);

  for (const rel of scenes) {
    const full = join(projectRoot, rel);
    let entries: unknown[];
    try {
      entries = JSON.parse(readFileSync(full, 'utf8')) as unknown[];
    } catch {
      issues.push({ file: rel, message: 'Invalid JSON', severity: 'error' });
      continue;
    }
    if (!Array.isArray(entries)) {
      issues.push({ file: rel, message: 'Root must be JSON array', severity: 'error' });
      continue;
    }

    const nodeIds = new Set<number>();
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as Record<string, unknown>;
      if (e?.__type__ === 'cc.Node') nodeIds.add(i);
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as Record<string, unknown>;
      const refs: { __id__: number }[] = [];

      if (Array.isArray(e._children)) refs.push(...(e._children as { __id__: number }[]));
      if (e._parent && typeof e._parent === 'object') refs.push(e._parent as { __id__: number });
      if (e.node && typeof e.node === 'object') refs.push(e.node as { __id__: number });
      if (Array.isArray(e._components)) refs.push(...(e._components as { __id__: number }[]));

      for (const ref of refs) {
        if (ref.__id__ == null || ref.__id__ < 0 || ref.__id__ >= entries.length) {
          issues.push({
            file: rel,
            message: `Invalid __id__ reference ${ref.__id__} at index ${i}`,
            severity: 'error',
          });
        }
      }
    }

    const sceneEntry = entries.find(
      (e) => (e as Record<string, unknown>).__type__ === 'cc.Scene',
    ) as Record<string, unknown> | undefined;
    if (!sceneEntry) {
      issues.push({ file: rel, message: 'Missing cc.Scene entry', severity: 'warn' });
    }
  }

  return issues;
}
