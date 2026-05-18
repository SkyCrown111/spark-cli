/**
 * Minimal Unity scene-graph reader/writer for `.unity` (and `.prefab`) YAML.
 *
 * Unity stores scenes as a sequence of YAML documents separated by `--- !u!<classId> &<fileId>`
 * markers. Each document represents one object: GameObject, Transform, MonoBehaviour, etc.
 * The format is tag-indented with predictable shapes — full fidelity needs the Unity editor,
 * but for the writes the MCP needs (rename, move, set property on a known component) a
 * line-based parser is enough.
 *
 * Scope:
 *   parseUnityScene  — returns { gameObjects: { fileId, name, transformId, components[] } }
 *   setProperty      — replace `  <key>: <value>` inside a target document
 *   addComponent     — append a stub MonoBehaviour doc and link it via the GameObject's
 *                      m_Component list
 *
 * What this *won't* do: cross-document refs beyond the GameObject↔Component link,
 * prefab variants, or scenes with addressables overrides. The MCP writer falls
 * back to `stage_project_file` for anything ambitious.
 */

import { readFileSync } from 'node:fs';

export interface UnityDoc {
  /** `m_ClassID` parsed from `!u!<n>` — useful for telling GameObject (1) from Transform (4). */
  classId: number;
  /** `&<fileId>`. Stable within a scene. */
  fileId: string;
  /** Top-level YAML key, e.g. `GameObject`, `Transform`, `MonoBehaviour`. */
  kind: string;
  /** Raw lines for the document including the `--- !u!…` header. */
  lines: string[];
}

export interface UnityGameObject {
  fileId: string;
  name: string;
  /** fileId of the Transform component (Unity stores it via m_Component → fileID). */
  transformFileId?: string;
  /** All component fileIds referenced in m_Component. */
  componentFileIds: string[];
}

export interface UnitySceneGraph {
  raw: string;
  docs: UnityDoc[];
  /** Indexed by fileId. */
  byId: Map<string, UnityDoc>;
  gameObjects: UnityGameObject[];
}

const HEADER_RE = /^---\s+!u!(\d+)\s+&(\d+)\s*$/;

function splitDocs(raw: string): UnityDoc[] {
  const lines = raw.split(/\r?\n/);
  const docs: UnityDoc[] = [];
  let cur: { header: RegExpMatchArray; kind?: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = HEADER_RE.exec(line);
    if (m) {
      if (cur) {
        docs.push({
          classId: Number(cur.header[1]),
          fileId: cur.header[2]!,
          kind: cur.kind ?? 'Unknown',
          lines: cur.lines,
        });
      }
      cur = { header: m, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
      if (cur.kind === undefined && /^[A-Za-z][A-Za-z0-9_]*:\s*$/.test(line)) {
        cur.kind = line.trim().replace(/:$/, '');
      }
    }
  }
  if (cur) {
    docs.push({
      classId: Number(cur.header[1]),
      fileId: cur.header[2]!,
      kind: cur.kind ?? 'Unknown',
      lines: cur.lines,
    });
  }
  return docs;
}

function findGameObjects(docs: UnityDoc[]): UnityGameObject[] {
  const out: UnityGameObject[] = [];
  for (const doc of docs) {
    if (doc.kind !== 'GameObject') continue;
    const name = scalar(doc, 'm_Name') ?? '';
    const componentRefs = collectFileIds(doc, 'm_Component');
    let transformFileId: string | undefined;
    for (const fid of componentRefs) {
      const compDoc = docs.find((d) => d.fileId === fid);
      if (!compDoc) continue;
      // 4 = Transform, 224 = RectTransform.
      if (compDoc.classId === 4 || compDoc.classId === 224) {
        transformFileId = fid;
        break;
      }
    }
    out.push({ fileId: doc.fileId, name, transformFileId, componentFileIds: componentRefs });
  }
  return out;
}

/** Read a top-level scalar (`  key: value`) from a doc. Returns trimmed value or null. */
export function scalar(doc: UnityDoc, key: string): string | null {
  const re = new RegExp(`^\\s+${key}:\\s*(.*)$`);
  for (const line of doc.lines) {
    const m = re.exec(line);
    if (m) return (m[1] ?? '').trim();
  }
  return null;
}

/** Collect `{fileID: <id>}` references under a list-valued key. */
export function collectFileIds(doc: UnityDoc, key: string): string[] {
  const ids: string[] = [];
  let inside = false;
  const startRe = new RegExp(`^\\s+${key}:\\s*$`);
  for (const line of doc.lines) {
    if (startRe.test(line)) {
      inside = true;
      continue;
    }
    if (inside) {
      // Sub-list lines are indented further. The first line at the parent indent ends the list.
      if (/^\s*-\s/.test(line)) {
        const m = /fileID:\s*(\d+)/.exec(line);
        if (m) ids.push(m[1]!);
      } else if (/^\s+\w+:/.test(line) && !/^\s+-\s/.test(line)) {
        // A peer key at the same indent ends the block.
        if (!/^\s{4,}/.test(line)) inside = false;
        else if (!line.includes('fileID:')) inside = false;
      }
    }
  }
  return ids;
}

export function parseUnityScene(path: string): UnitySceneGraph {
  const raw = readFileSync(path, 'utf8');
  const docs = splitDocs(raw);
  const byId = new Map<string, UnityDoc>();
  for (const d of docs) byId.set(d.fileId, d);
  return { raw, docs, byId, gameObjects: findGameObjects(docs) };
}

export interface SetPropertyResult {
  text: string;
  changed: boolean;
}

/**
 * Replace a top-level scalar `key: value` inside the target doc. Returns the
 * full file text plus whether anything was actually rewritten.
 */
export function setProperty(
  scene: UnitySceneGraph,
  fileId: string,
  key: string,
  value: string,
): SetPropertyResult {
  const doc = scene.byId.get(fileId);
  if (!doc) throw new Error(`unity scene: no doc with fileId ${fileId}`);
  const re = new RegExp(`^(\\s+)${key}:\\s*.*$`);
  let changed = false;
  const newDocLines = doc.lines.map((line) => {
    const m = re.exec(line);
    if (m && !changed) {
      changed = true;
      return `${m[1]}${key}: ${value}`;
    }
    return line;
  });
  if (!changed) {
    // Insert just before the next top-level header (i.e. at end of the doc).
    const last = newDocLines.length;
    newDocLines.splice(last, 0, `  ${key}: ${value}`);
    changed = true;
  }
  const text = scene.docs
    .map((d) => (d.fileId === fileId ? newDocLines : d.lines))
    .map((arr) => arr.join('\n'))
    .join('\n');
  return { text, changed };
}

export interface AddComponentInput {
  /** GameObject fileId to attach the component to. */
  gameObjectFileId: string;
  /** classId for the component. Caller must know it (e.g. 114 = MonoBehaviour). */
  classId: number;
  /** GUID + fileID of the script asset (m_Script). */
  scriptGuid?: string;
  scriptFileId?: string;
  /** Stable but unique fileId for the new component doc. */
  newFileId: string;
}

/**
 * Append a MonoBehaviour stub document to the scene and link it from the
 * GameObject's m_Component list. Returns the updated full-file text.
 */
export function addComponent(scene: UnitySceneGraph, input: AddComponentInput): string {
  const goDoc = scene.byId.get(input.gameObjectFileId);
  if (!goDoc || goDoc.kind !== 'GameObject') {
    throw new Error(`unity scene: no GameObject with fileId ${input.gameObjectFileId}`);
  }
  if (scene.byId.has(input.newFileId)) {
    throw new Error(`unity scene: fileId ${input.newFileId} already in use`);
  }

  // 1) Patch GameObject m_Component to include the new component reference.
  const updatedGo = insertComponentRef(goDoc, input.newFileId);

  // 2) Build the new component doc.
  const compLines = buildMonoBehaviourDoc(input);

  const allDocs = scene.docs.map((d) => {
    if (d.fileId !== input.gameObjectFileId) return d.lines;
    return updatedGo;
  });
  allDocs.push(compLines);
  return allDocs.map((arr) => arr.join('\n')).join('\n');
}

function insertComponentRef(goDoc: UnityDoc, newFileId: string): string[] {
  const out: string[] = [];
  let inserted = false;
  let inComponentList = false;
  for (let i = 0; i < goDoc.lines.length; i++) {
    const line = goDoc.lines[i]!;
    out.push(line);
    if (/^\s+m_Component:\s*$/.test(line)) inComponentList = true;
    else if (inComponentList && !inserted) {
      const next = goDoc.lines[i + 1];
      const stillInList = typeof next === 'string' && /^\s*-\s/.test(next);
      if (!stillInList && /^\s*-\s/.test(line)) {
        out.push(`  - component: {fileID: ${newFileId}}`);
        inserted = true;
        inComponentList = false;
      }
    }
  }
  if (!inserted) {
    // GameObject without an m_Component block — synthesise one.
    out.push('  m_Component:');
    out.push(`  - component: {fileID: ${newFileId}}`);
  }
  return out;
}

function buildMonoBehaviourDoc(input: AddComponentInput): string[] {
  const header = `--- !u!${input.classId} &${input.newFileId}`;
  const scriptRef = input.scriptGuid && input.scriptFileId
    ? `{fileID: ${input.scriptFileId}, guid: ${input.scriptGuid}, type: 3}`
    : '{fileID: 0}';
  return [
    header,
    'MonoBehaviour:',
    '  m_ObjectHideFlags: 0',
    '  m_CorrespondingSourceObject: {fileID: 0}',
    '  m_PrefabInstance: {fileID: 0}',
    '  m_PrefabAsset: {fileID: 0}',
    '  m_Enabled: 1',
    '  m_EditorHideFlags: 0',
    `  m_Script: ${scriptRef}`,
    '  m_Name: ',
    '  m_EditorClassIdentifier: ',
  ];
}

/** Convenience: project the parsed graph into the same shape MCP scene_analyze uses. */
export function unitySceneToMcpTree(scene: UnitySceneGraph): {
  gameObjects: Array<{ fileId: string; name: string; transformFileId?: string; components: string[] }>;
} {
  return {
    gameObjects: scene.gameObjects.map((g) => ({
      fileId: g.fileId,
      name: g.name,
      transformFileId: g.transformFileId,
      components: g.componentFileIds,
    })),
  };
}
