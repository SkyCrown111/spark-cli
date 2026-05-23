/**
 * Phase 14 #2 — Cocos scene writer extras.
 *
 * Adds `removeSceneNode`, `duplicateSceneNode`, `reorderSceneChildren`, plus a
 * project-wide `scanUuidReferences` helper.
 *
 * Cocos 3.x scene/prefab files are JSON arrays where every cross-entry link is
 * `{ "__id__": <array-index> }`. That makes removal expensive: dropping any
 * entry shifts every subsequent index, so we have to compact the array and
 * rewrite ALL `__id__` references.
 *
 * `removeSceneNode` defaults to refusing the delete when other entries (outside
 * the subtree) point to the node or its components — those references would
 * dangle. `force: true` proceeds anyway and returns the impact list so the
 * agent can fix them in a follow-up turn.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stageWriteFile } from '../../core/staging/patch-manager.js';

interface SceneEntry {
  __type__?: string;
  _name?: string;
  _children?: { __id__: number }[];
  _parent?: { __id__: number } | null;
  _components?: { __id__: number }[];
  node?: { __id__: number };
  [key: string]: unknown;
}

function loadEntries(scenePath: string): SceneEntry[] {
  const raw = readFileSync(scenePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Scene file must be a JSON array (Cocos 3.x format)');
  }
  return data as SceneEntry[];
}

function saveEntries(entries: SceneEntry[]): string {
  return JSON.stringify(entries, null, 2) + '\n';
}

function findNodeIndexByPath(entries: SceneEntry[], nodePath: string): number {
  const parts = nodePath.split('/').filter(Boolean);
  if (!parts.length) throw new Error('nodePath is required');
  const sceneIdx = entries.findIndex((e) => e.__type__ === 'cc.Scene');
  let current = -1;
  if (sceneIdx >= 0) {
    for (const child of entries[sceneIdx]?._children ?? []) {
      if (entries[child.__id__]?._name === parts[0]) {
        current = child.__id__;
        break;
      }
    }
  }
  if (current < 0) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].__type__ === 'cc.Node' && entries[i]._name === parts[0]) {
        current = i;
        break;
      }
    }
  }
  if (current < 0) throw new Error(`Node not found: ${parts[0]}`);
  for (let p = 1; p < parts.length; p++) {
    let found = -1;
    for (const child of entries[current]?._children ?? []) {
      if (entries[child.__id__]?._name === parts[p]) {
        found = child.__id__;
        break;
      }
    }
    if (found < 0) throw new Error(`Node not found: ${parts.slice(0, p + 1).join('/')}`);
    current = found;
  }
  return current;
}

/** Recursively collect all node + component ids belonging to a subtree. */
function collectSubtreeIds(entries: SceneEntry[], rootId: number): Set<number> {
  const ids = new Set<number>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    ids.add(id);
    const node = entries[id];
    if (!node) continue;
    for (const c of node._components ?? []) ids.add(c.__id__);
    for (const c of node._children ?? []) queue.push(c.__id__);
  }
  return ids;
}

/**
 * Scan every entry NOT in `removedIds` for `{__id__: X}` references where X is
 * in `removedIds`. The parent's own `_children` link to the root is allowed
 * (passed in via `allowedFromParent`).
 */
function findExternalReferences(
  entries: SceneEntry[],
  removedIds: Set<number>,
  allowed: { fromEntryId: number; childId: number },
): Array<{ ownerEntryId: number; ownerType: string; refId: number; pathHint: string }> {
  const hits: Array<{ ownerEntryId: number; ownerType: string; refId: number; pathHint: string }> =
    [];

  function walk(value: unknown, ownerId: number, pathHint: string): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, ownerId, `${pathHint}[${i}]`));
      return;
    }
    const obj = value as Record<string, unknown>;
    const idVal = obj.__id__;
    if (typeof idVal === 'number' && removedIds.has(idVal)) {
      // Allow the parent's _children link to the root we're removing.
      if (
        ownerId === allowed.fromEntryId &&
        idVal === allowed.childId &&
        pathHint.startsWith('_children')
      ) {
        return;
      }
      hits.push({
        ownerEntryId: ownerId,
        ownerType: String(entries[ownerId]?.__type__ ?? 'unknown'),
        refId: idVal,
        pathHint,
      });
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      walk(v, ownerId, pathHint ? `${pathHint}.${k}` : k);
    }
  }

  for (let i = 0; i < entries.length; i++) {
    if (removedIds.has(i)) continue;
    walk(entries[i], i, '');
  }
  return hits;
}

/** Compact `entries` by removing `removed` ids and rebuild every `__id__` ref. */
function compactEntries(entries: SceneEntry[], removed: Set<number>): SceneEntry[] {
  const remap = new Map<number, number>();
  let next = 0;
  for (let i = 0; i < entries.length; i++) {
    if (removed.has(i)) continue;
    remap.set(i, next++);
  }
  const survived = entries.filter((_, i) => !removed.has(i));

  function remapValue(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return (
        value
          .map(remapValue)
          // also drop any `{__id__: removed}` items that survived inside arrays
          .filter((item) => {
            if (item && typeof item === 'object' && '__id__' in (item as object)) {
              const x = (item as { __id__: unknown }).__id__;
              if (typeof x === 'number' && x === -1) return false;
            }
            return true;
          })
      );
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.__id__ === 'number') {
      const newId = remap.get(obj.__id__);
      if (newId === undefined) return { __id__: -1 }; // marked for filtering above
      return { ...obj, __id__: newId };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = remapValue(v);
    return out;
  }

  return survived.map((e) => remapValue(e) as SceneEntry);
}

// ---------- Public API -----------------------------------------------------

export interface RemoveNodeImpact {
  ownerEntryType: string;
  ownerEntryId: number;
  refId: number;
  pathHint: string;
}

export class RefIntegrityError extends Error {
  readonly impact: RemoveNodeImpact[];
  constructor(message: string, impact: RemoveNodeImpact[]) {
    super(message);
    this.name = 'RefIntegrityError';
    this.impact = impact;
  }
}

export interface RemoveNodeResult {
  scenePath: string;
  nodePath: string;
  removedNodeIds: number[];
  removedComponentCount: number;
  staged: true;
}

export function removeSceneNodeFromStaging(
  projectRoot: string,
  sceneRelPath: string,
  nodePath: string,
  opts: { force?: boolean } = {},
): RemoveNodeResult {
  const full = join(projectRoot, sceneRelPath);
  const entries = loadEntries(full);
  const nodeId = findNodeIndexByPath(entries, nodePath);
  const node = entries[nodeId];
  if (!node) throw new Error(`Node entry missing for ${nodePath}`);
  const parentRef = node._parent;
  if (!parentRef || typeof parentRef.__id__ !== 'number') {
    throw new Error(`Cannot remove node without a parent (${nodePath})`);
  }
  const parentId = parentRef.__id__;

  const subtreeIds = collectSubtreeIds(entries, nodeId);
  const impact = findExternalReferences(entries, subtreeIds, {
    fromEntryId: parentId,
    childId: nodeId,
  });

  if (impact.length > 0 && !opts.force) {
    throw new RefIntegrityError(
      `Cannot remove node ${nodePath}: ${impact.length} external reference(s) remain. Pass force:true to override.`,
      impact.map((h) => ({
        ownerEntryType: h.ownerType,
        ownerEntryId: h.ownerEntryId,
        refId: h.refId,
        pathHint: h.pathHint,
      })),
    );
  }

  // Strip parent's _children link to the root.
  const parent = entries[parentId];
  if (parent) {
    parent._children = (parent._children ?? []).filter((c) => c.__id__ !== nodeId);
  }

  const compacted = compactEntries(entries, subtreeIds);
  stageWriteFile(projectRoot, sceneRelPath, saveEntries(compacted));

  const removedComponentCount = Array.from(subtreeIds).filter(
    (id) => entries[id]?.__type__ !== 'cc.Node',
  ).length;
  const removedNodeIds = Array.from(subtreeIds).filter((id) => entries[id]?.__type__ === 'cc.Node');

  return {
    scenePath: sceneRelPath,
    nodePath,
    removedNodeIds,
    removedComponentCount,
    staged: true,
  };
}

export interface DuplicateNodeResult {
  scenePath: string;
  newNodePath: string;
  newRootNodeId: number;
  staged: true;
}

export function duplicateSceneNodeInStaging(
  projectRoot: string,
  sceneRelPath: string,
  nodePath: string,
  opts: { newName?: string } = {},
): DuplicateNodeResult {
  const full = join(projectRoot, sceneRelPath);
  const entries = loadEntries(full);
  const srcRoot = findNodeIndexByPath(entries, nodePath);
  const srcEntry = entries[srcRoot];
  if (!srcEntry || srcEntry.__type__ !== 'cc.Node') {
    throw new Error(`Cannot duplicate non-node entry at ${nodePath}`);
  }
  const parentRef = srcEntry._parent;
  if (!parentRef) throw new Error(`Cannot duplicate root node (${nodePath})`);
  const parentId = parentRef.__id__;

  const srcIds = Array.from(collectSubtreeIds(entries, srcRoot));
  // Append clones in source order; keep oldId → newId mapping.
  const idMap = new Map<number, number>();
  let appendIdx = entries.length;
  for (const oldId of srcIds) {
    idMap.set(oldId, appendIdx++);
  }

  function rewriteIds(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(rewriteIds);
    const obj = value as Record<string, unknown>;
    if (typeof obj.__id__ === 'number') {
      const mapped = idMap.get(obj.__id__);
      // Internal refs to the duplicated subtree get remapped; refs to outside
      // (e.g. the original parent) stay as-is for now and we patch _parent below.
      if (mapped !== undefined) return { ...obj, __id__: mapped };
      return { ...obj };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = rewriteIds(v);
    return out;
  }

  const newEntries = entries.slice();
  for (const oldId of srcIds) {
    const clone = rewriteIds(structuredClone(entries[oldId])) as SceneEntry;
    newEntries.push(clone);
  }

  // The clone of the root: rename + reparent to the SAME parent the source had.
  const newRootId = idMap.get(srcRoot)!;
  const newRoot = newEntries[newRootId]!;
  newRoot._parent = { __id__: parentId };
  if (opts.newName) newRoot._name = opts.newName;
  else if (typeof newRoot._name === 'string') newRoot._name = `${newRoot._name}_copy`;

  // Append clone to parent's _children.
  const parent = newEntries[parentId];
  if (parent) {
    parent._children = [...(parent._children ?? []), { __id__: newRootId }];
  }

  stageWriteFile(projectRoot, sceneRelPath, saveEntries(newEntries));

  const parentPath = nodePath.includes('/') ? nodePath.slice(0, nodePath.lastIndexOf('/')) : '';
  const newNodePath = parentPath ? `${parentPath}/${newRoot._name}` : String(newRoot._name ?? '');

  return {
    scenePath: sceneRelPath,
    newNodePath,
    newRootNodeId: newRootId,
    staged: true,
  };
}

export interface ReorderResult {
  scenePath: string;
  parentPath: string;
  childCount: number;
  staged: true;
}

export function reorderSceneChildrenInStaging(
  projectRoot: string,
  sceneRelPath: string,
  parentPath: string,
  childOrder: string[],
): ReorderResult {
  const full = join(projectRoot, sceneRelPath);
  const entries = loadEntries(full);
  const parentId = findNodeIndexByPath(entries, parentPath);
  const parent = entries[parentId];
  if (!parent) throw new Error(`Parent node ${parentPath} missing`);

  const currentChildren = parent._children ?? [];
  const byName = new Map<string, { __id__: number }>();
  for (const ref of currentChildren) {
    const name = entries[ref.__id__]?._name;
    if (typeof name === 'string') byName.set(name, ref);
  }

  if (childOrder.length !== currentChildren.length) {
    throw new Error(
      `reorderSceneChildren: childOrder size ${childOrder.length} != current ${currentChildren.length}`,
    );
  }
  const newChildren: { __id__: number }[] = [];
  for (const name of childOrder) {
    const ref = byName.get(name);
    if (!ref)
      throw new Error(`reorderSceneChildren: child '${name}' not found under ${parentPath}`);
    newChildren.push(ref);
  }
  parent._children = newChildren;

  stageWriteFile(projectRoot, sceneRelPath, saveEntries(entries));

  return {
    scenePath: sceneRelPath,
    parentPath,
    childCount: newChildren.length,
    staged: true,
  };
}

// ---------- UUID reference scanner -----------------------------------------

export interface UuidReferenceHit {
  /** Project-relative path. */
  file: string;
  /** Where inside the JSON the `__uuid__` was found. */
  pathHint: string;
}

/**
 * Walk `assets/**\/*.{scene,prefab}` (and a few other JSON-shaped Cocos files)
 * and collect every spot that holds `"__uuid__": "<uuid>"`. Used by the
 * `removeSceneNode` impact preview and standalone for `spark-cli assets audit`.
 */
export function scanUuidReferences(projectRoot: string, uuid: string): UuidReferenceHit[] {
  const hits: UuidReferenceHit[] = [];
  const candidateExts = new Set(['.scene', '.prefab', '.meta', '.json']);
  const assetsDir = join(projectRoot, 'assets');
  if (!existsSync(assetsDir)) return hits;

  function walkAssets(dir: string, files: string[]): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walkAssets(full, files);
      else files.push(full);
    }
  }
  const files: string[] = [];
  walkAssets(assetsDir, files);

  for (const file of files) {
    const lower = file.toLowerCase();
    let matchedExt = false;
    for (const ext of candidateExts) {
      if (lower.endsWith(ext)) {
        matchedExt = true;
        break;
      }
    }
    if (!matchedExt) continue;
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const relForReport = relative(projectRoot, file).replace(/\\/g, '/');
    if (!raw.includes(uuid)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Non-JSON .meta/.json fragments — fall back to simple string match.
      hits.push({ file: relForReport, pathHint: '<text-match>' });
      continue;
    }
    function walk(value: unknown, pathHint: string): void {
      if (value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${pathHint}[${i}]`));
        return;
      }
      const obj = value as Record<string, unknown>;
      if (typeof obj.__uuid__ === 'string' && obj.__uuid__ === uuid) {
        hits.push({ file: relForReport, pathHint });
      }
      for (const [k, v] of Object.entries(obj)) {
        walk(v, pathHint ? `${pathHint}.${k}` : k);
      }
    }
    walk(parsed, '');
  }
  return hits;
}
