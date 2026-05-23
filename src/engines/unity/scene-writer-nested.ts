/**
 * Phase 14 #1 — Unity scene-graph writer 深化.
 *
 * Phase 13 added top-level `setProperty(doc, key, value)` and `addComponent`.
 * Game-dev workflows need three more operations:
 *
 *   1. Nested path writes: `m_LocalScale.x`, `m_Component[2].component.fileID`,
 *      `m_Modification.m_Modifications[0].value` — Unity stores these as inline
 *      flow-style maps or as block-style YAML lists, so the writer needs to
 *      handle both forms.
 *   2. Component removal: drop the `m_Component[]` entry on the GameObject AND
 *      delete the component's standalone document.
 *   3. Prefab-instance replacement: patch the `PrefabInstance` doc's
 *      `m_SourcePrefab` ref AND every `m_Modifications[*].target.guid` that
 *      pointed at the old prefab.
 *
 * Constraints:
 *   - No `js-yaml`. We rewrite Unity's quirky YAML by line/regex tracking,
 *     same as `scene-graph.ts` already does. Round-trip fidelity is the goal,
 *     not full YAML support.
 *   - All callers go through `scene-writer.ts` so writes stage to
 *     `.spark/staging/`.
 */

import type { UnityDoc, UnitySceneGraph } from './scene-graph.js';

export interface NestedPropertyResult {
  text: string;
  changed: boolean;
}

export interface RemoveComponentResult {
  text: string;
  removedComponentFileId: string;
  removedFromGameObject: string;
}

export interface PrefabReplaceInput {
  /** PrefabInstance doc fileId (classId 1001). */
  instanceFileId: string;
  /** New `guid:` to splat into `m_SourcePrefab` (and modification targets sharing the old guid). */
  newPrefabGuid: string;
  /** Optional new `fileID:` for `m_SourcePrefab`. Leave undefined to keep existing. */
  newSourcePrefabFileId?: string;
}

export interface PrefabReplaceResult {
  text: string;
  changed: boolean;
  oldGuid: string | null;
}

// ---------- Path parser -----------------------------------------------------

export type PathSegment = { kind: 'key'; name: string } | { kind: 'index'; idx: number };

/**
 * Parse a nested path like `m_LocalScale.x` or `m_Component[2].component.fileID`
 * into an array of segments. Whitespace is not allowed; bracket index must be
 * a non-negative integer.
 */
export function parseNestedPath(path: string): PathSegment[] {
  const segs: PathSegment[] = [];
  let i = 0;
  let expectKey = true; // first segment must be a key, and `..` is forbidden
  while (i < path.length) {
    if (path[i] === '.') {
      if (expectKey) throw new Error(`unity path: empty key segment in ${path}`);
      i++;
      expectKey = true;
      continue;
    }
    if (path[i] === '[') {
      if (expectKey && segs.length === 0) {
        throw new Error(`unity path: must start with a key in ${path}`);
      }
      const end = path.indexOf(']', i);
      if (end < 0) throw new Error(`unity path: missing ']' in ${path}`);
      const numText = path.slice(i + 1, end);
      const idx = Number(numText);
      if (!Number.isInteger(idx) || idx < 0) {
        throw new Error(`unity path: invalid index '${numText}' in ${path}`);
      }
      segs.push({ kind: 'index', idx });
      i = end + 1;
      expectKey = false;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j++;
    const name = path.slice(i, j);
    if (!name) throw new Error(`unity path: empty key segment in ${path}`);
    segs.push({ kind: 'key', name });
    i = j;
    expectKey = false;
  }
  if (expectKey && segs.length > 0) {
    throw new Error(`unity path: trailing '.' in ${path}`);
  }
  return segs;
}

// ---------- Doc-line helpers ------------------------------------------------

/** Indentation prefix of a line, e.g. '  ' for `  m_Name: foo`. */
function indentOf(line: string): string {
  const m = /^(\s*)/.exec(line);
  return m ? m[1]! : '';
}

/** Find the index of `  <key>:` inside doc.lines starting at `start`, restricted to the given indent. */
function findKeyAtIndent(
  lines: string[],
  start: number,
  end: number,
  indent: string,
  key: string,
): number {
  const re = new RegExp(`^${indent}${key}\\s*:(\\s|$)`);
  for (let i = start; i < end; i++) {
    if (re.test(lines[i]!)) return i;
  }
  return -1;
}

/**
 * Find the index of the n-th list item (a `- ` line) at the given indent inside
 * [start, end). Returns -1 if not enough items.
 */
function findListItemAtIndent(
  lines: string[],
  start: number,
  end: number,
  indent: string,
  n: number,
): number {
  const re = new RegExp(`^${indent}-\\s`);
  let seen = -1;
  for (let i = start; i < end; i++) {
    if (re.test(lines[i]!)) {
      seen++;
      if (seen === n) return i;
    } else if (lines[i]!.startsWith(indent) && !/^\s/.test(lines[i]!.slice(indent.length))) {
      // a peer key at the same indent as `- ` would be the same level;
      // we stop only if we hit a line less indented than this list.
    } else if (lines[i]!.length > 0 && indentOf(lines[i]!).length < indent.length) {
      // dedented past the list start — list is over.
      return -1;
    }
  }
  return -1;
}

/**
 * Compute the half-open block range [start+1, blockEnd) for the children of a
 * key-line at index `keyIdx`. The block ends at the first line whose indent
 * is <= the parent indent (or at end of doc).
 */
function blockRangeOf(lines: string[], keyIdx: number, parentIndent: string): [number, number] {
  const start = keyIdx + 1;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) continue;
    const ind = indentOf(line);
    if (ind.length <= parentIndent.length) {
      end = i;
      break;
    }
  }
  return [start, end];
}

/**
 * Compute the line range belonging to a list item starting at `itemIdx`. Item
 * lines run until the next sibling `- ` line at the same indent OR a peer key
 * at parent indent OR doc end.
 */
function listItemRange(lines: string[], itemIdx: number, itemIndent: string): [number, number] {
  const peerListRe = new RegExp(`^${itemIndent}-\\s`);
  for (let i = itemIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) continue;
    const ind = indentOf(line);
    if (ind.length < itemIndent.length) return [itemIdx, i];
    if (peerListRe.test(line)) return [itemIdx, i];
  }
  return [itemIdx, lines.length];
}

// ---------- Inline flow-map handling ---------------------------------------

/**
 * Replace `key: <oldValue>` inside an inline flow-map value like
 * `{x: 1, y: 1, z: 1}`. Returns the new value text or null if key not found.
 */
function rewriteInlineMap(value: string, key: string, newScalar: string): string | null {
  // Strip leading/trailing braces, work on inner.
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  const inner = trimmed.slice(1, -1);
  // Tokenise top-level entries by comma at depth 0 (handles nested braces).
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) parts.push(buf);

  let hit = false;
  const newParts = parts.map((part) => {
    const colon = part.indexOf(':');
    if (colon < 0) return part;
    const k = part.slice(0, colon).trim();
    if (k !== key) return part;
    hit = true;
    // Preserve original leading whitespace.
    const leading = part.slice(0, part.length - part.trimStart().length);
    return `${leading}${k}: ${newScalar}`;
  });
  if (!hit) return null;
  return '{' + newParts.join(',') + '}';
}

// ---------- Nested set ------------------------------------------------------

/**
 * Walk segments from the top of `doc.lines` and rewrite the leaf scalar.
 *
 * Strategy:
 *   - Each `key` segment narrows [lo, hi) to the children of that key.
 *   - Each `index` segment further narrows to a single list item.
 *   - At the leaf segment, if the parent line is `key: <flow-map>`, rewrite
 *     the inline map key. Otherwise rewrite `key: value` on the line.
 *
 * Returns updated full-file text + whether anything changed.
 */
export function setNestedProperty(
  scene: UnitySceneGraph,
  fileId: string,
  path: string,
  value: string,
): NestedPropertyResult {
  const doc = scene.byId.get(fileId);
  if (!doc) throw new Error(`unity scene: no doc with fileId ${fileId}`);
  const segs = parseNestedPath(path);
  if (segs.length === 0) throw new Error('unity scene: empty nested path');
  if (segs[0]!.kind !== 'key') throw new Error('unity scene: path must start with a key');

  const lines = [...doc.lines];

  // The doc.lines layout is:
  //   line 0: --- !u!N &fileId
  //   line 1: <Kind>:
  //   line 2..: indented children of <Kind>
  // So the top of the field tree is "line 1, indent ''" → children at indent '  '.
  const docKindIdx = 1;
  const docKindLine = lines[docKindIdx];
  if (typeof docKindLine !== 'string' || !/^[A-Za-z]/.test(docKindLine)) {
    throw new Error('unity scene: cannot locate document kind line');
  }
  let lo = 2;
  let hi = lines.length;
  let curIndent = '  ';

  // Walk all but the last segment, narrowing the window.
  // Special case: if the next segment is the leaf AND the current key holds an
  // inline flow-map value (e.g. `m_LocalScale: {x: 1, y: 1, z: 1}`), the leaf
  // logic below rewrites the inline map directly. Don't try to descend.
  for (let s = 0; s < segs.length - 1; s++) {
    const seg = segs[s]!;
    if (seg.kind === 'key') {
      const idx = findKeyAtIndent(lines, lo, hi, curIndent, seg.name);
      if (idx < 0) {
        throw new Error(`unity scene: key '${seg.name}' not found under ${path}`);
      }
      const valueAfterColon = lines[idx]!.slice(curIndent.length + seg.name.length + 1).trim();
      const isInlineMap = valueAfterColon.startsWith('{');
      const isLastBeforeLeaf = s === segs.length - 2 && segs[segs.length - 1]!.kind === 'key';
      if (isInlineMap && isLastBeforeLeaf) {
        // Leave [lo, hi) as-is; leaf logic below will inline-map-rewrite.
        curIndent = curIndent + '  ';
        break;
      }
      if (valueAfterColon.length > 0) {
        throw new Error(
          `unity scene: cannot descend into inline value at '${seg.name}' (path ${path})`,
        );
      }
      [lo, hi] = blockRangeOf(lines, idx, curIndent);
      curIndent = curIndent + '  ';
    } else {
      // index — pick the n-th `- ` item at the current indent.
      const itemIdx = findListItemAtIndent(lines, lo, hi, curIndent, seg.idx);
      if (itemIdx < 0) {
        throw new Error(`unity scene: list index ${seg.idx} out of range under ${path}`);
      }
      [lo, hi] = listItemRange(lines, itemIdx, curIndent);
      // After diving into a list item, child keys are at itemIndent + 2 spaces,
      // BUT the first child sits on the same line as `- key: ...`. We treat
      // the item line itself as a synthetic block whose children share the
      // indent two-deeper than the dash.
      curIndent = curIndent + '  ';
    }
  }

  // Leaf segment.
  const leaf = segs[segs.length - 1]!;
  if (leaf.kind === 'index') {
    throw new Error(`unity scene: cannot end nested path with an index (${path})`);
  }

  // Try in-line flow-map rewrite on the parent (case `m_LocalScale.x`).
  // The parent key produced curIndent = parentIndent + '  '; back up one level.
  const parentIndent = curIndent.slice(0, -2);
  if (segs.length >= 2 && segs[segs.length - 2]!.kind === 'key') {
    const parentName = (segs[segs.length - 2] as { kind: 'key'; name: string }).name;
    // Find the parent line within [docKindIdx+1, lines.length).
    const parentIdx = findKeyAtIndent(
      lines,
      docKindIdx + 1,
      lines.length,
      parentIndent,
      parentName,
    );
    if (parentIdx >= 0) {
      const parentLine = lines[parentIdx]!;
      const colon = parentLine.indexOf(':');
      const after = parentLine.slice(colon + 1).trim();
      if (after.startsWith('{')) {
        const replaced = rewriteInlineMap(after, leaf.name, value);
        if (replaced !== null) {
          lines[parentIdx] = parentLine.slice(0, colon + 1) + ' ' + replaced;
          const text = scene.docs
            .map((d) => (d.fileId === fileId ? lines : d.lines))
            .map((arr) => arr.join('\n'))
            .join('\n');
          return { text, changed: true };
        }
      }
    }
  }

  // Block-form rewrite: find leaf key inside [lo, hi) at curIndent.
  const leafIdx = findKeyAtIndent(lines, lo, hi, curIndent, leaf.name);
  if (leafIdx < 0) {
    // For list-item leaves, also try `<itemIndent>- <key>: ...` style.
    const dashIndent = curIndent.slice(0, -2);
    const dashRe = new RegExp(`^${dashIndent}-\\s+${leaf.name}\\s*:\\s*(.*)$`);
    for (let i = lo; i < hi; i++) {
      const m = dashRe.exec(lines[i]!);
      if (m) {
        lines[i] = `${dashIndent}- ${leaf.name}: ${value}`;
        const text = scene.docs
          .map((d) => (d.fileId === fileId ? lines : d.lines))
          .map((arr) => arr.join('\n'))
          .join('\n');
        return { text, changed: true };
      }
    }
    throw new Error(`unity scene: leaf key '${leaf.name}' not found (path ${path})`);
  }
  lines[leafIdx] = `${curIndent}${leaf.name}: ${value}`;
  const text = scene.docs
    .map((d) => (d.fileId === fileId ? lines : d.lines))
    .map((arr) => arr.join('\n'))
    .join('\n');
  return { text, changed: true };
}

// ---------- Component removal ----------------------------------------------

/**
 * Remove a component from a GameObject:
 *   - delete the matching `- component: {fileID: <id>}` entry under m_Component
 *   - delete the component's standalone document
 *
 * Throws if the GameObject doesn't reference the component, or the component
 * doc isn't present.
 */
export function removeComponent(
  scene: UnitySceneGraph,
  gameObjectFileId: string,
  componentFileId: string,
): RemoveComponentResult {
  const goDoc = scene.byId.get(gameObjectFileId);
  if (!goDoc || goDoc.kind !== 'GameObject') {
    throw new Error(`unity scene: no GameObject with fileId ${gameObjectFileId}`);
  }
  const compDoc = scene.byId.get(componentFileId);
  if (!compDoc) {
    throw new Error(`unity scene: no component doc with fileId ${componentFileId}`);
  }
  const compRefRe = new RegExp(`^\\s*-\\s*component:\\s*\\{fileID:\\s*${componentFileId}\\}\\s*$`);
  const newGoLines = goDoc.lines.filter((line) => !compRefRe.test(line));
  if (newGoLines.length === goDoc.lines.length) {
    throw new Error(
      `unity scene: GameObject ${gameObjectFileId} does not reference component ${componentFileId}`,
    );
  }

  const allDocs = scene.docs
    .filter((d) => d.fileId !== componentFileId)
    .map((d) => (d.fileId === gameObjectFileId ? newGoLines : d.lines));
  const text = allDocs.map((arr) => arr.join('\n')).join('\n');
  return {
    text,
    removedComponentFileId: componentFileId,
    removedFromGameObject: gameObjectFileId,
  };
}

// ---------- Prefab-instance replacement ------------------------------------

/**
 * Replace the source prefab of a `PrefabInstance` doc:
 *   - patch `m_SourcePrefab: {fileID: …, guid: <new>, type: 3}`
 *   - rewrite every `m_Modifications[*].target` entry whose guid matched the
 *     old guid to use the new one (modifications referencing other prefabs
 *     are left alone)
 */
export function replacePrefabInstance(
  scene: UnitySceneGraph,
  input: PrefabReplaceInput,
): PrefabReplaceResult {
  const doc = scene.byId.get(input.instanceFileId);
  if (!doc) {
    throw new Error(`unity scene: no PrefabInstance with fileId ${input.instanceFileId}`);
  }
  if (doc.kind !== 'PrefabInstance') {
    throw new Error(`unity scene: doc ${input.instanceFileId} is ${doc.kind}, not PrefabInstance`);
  }

  // Find m_SourcePrefab line and pull the existing guid.
  const guidRe = /guid:\s*([0-9a-f]{32})/;
  let oldGuid: string | null = null;
  let sourceIdx = -1;
  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i]!;
    if (/^\s+m_SourcePrefab:\s*\{/.test(line)) {
      sourceIdx = i;
      const m = guidRe.exec(line);
      if (m) oldGuid = m[1]!;
      break;
    }
  }
  if (sourceIdx < 0) {
    throw new Error(`unity scene: m_SourcePrefab not found in ${input.instanceFileId}`);
  }

  let changed = false;
  const newLines = doc.lines.map((line, i) => {
    if (i === sourceIdx) {
      let next = line;
      if (input.newSourcePrefabFileId !== undefined) {
        next = next.replace(/fileID:\s*-?\d+/, `fileID: ${input.newSourcePrefabFileId}`);
      }
      if (oldGuid) {
        next = next.replace(guidRe, `guid: ${input.newPrefabGuid}`);
      } else if (next.includes('guid:')) {
        next = next.replace(guidRe, `guid: ${input.newPrefabGuid}`);
      }
      changed = changed || next !== line;
      return next;
    }
    // Inside m_Modifications, target lines look like:
    //   - target: {fileID: 7777, guid: <old>, type: 3}
    if (oldGuid && /^\s*-\s*target:\s*\{/.test(line) && line.includes(oldGuid)) {
      const next = line.replace(guidRe, `guid: ${input.newPrefabGuid}`);
      if (next !== line) changed = true;
      return next;
    }
    return line;
  });

  const text = scene.docs
    .map((d) => (d.fileId === input.instanceFileId ? newLines : d.lines))
    .map((arr) => arr.join('\n'))
    .join('\n');
  return { text, changed, oldGuid };
}

// ---------- Asset/script linkage helpers (used by addComponent v2) ---------

/**
 * Find a GameObject by name. Throws if zero or >1 matches.
 */
export function findGameObjectByName(scene: UnitySceneGraph, name: string): UnityDoc {
  const matches = scene.gameObjects.filter((g) => g.name === name);
  if (matches.length === 0) throw new Error(`unity scene: no GameObject named ${name}`);
  if (matches.length > 1) {
    throw new Error(`unity scene: multiple GameObjects named ${name} — pass fileId instead`);
  }
  const doc = scene.byId.get(matches[0]!.fileId);
  if (!doc) throw new Error(`unity scene: GameObject ${name} doc missing`);
  return doc;
}
