import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWriteFile } from '../../core/staging/patch-manager.js';

interface SceneEntry {
  __type__?: string;
  _name?: string;
  _children?: { __id__: number }[];
  _parent?: { __id__: number } | null;
  _components?: { __id__: number }[];
  node?: { __id__: number };
  _active?: boolean;
  _enabled?: boolean;
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
  let currentIdx = -1;

  if (sceneIdx >= 0) {
    const roots = entries[sceneIdx]._children ?? [];
    for (const child of roots) {
      const entry = entries[child.__id__];
      if (entry?._name === parts[0]) {
        currentIdx = child.__id__;
        break;
      }
    }
  }

  if (currentIdx < 0) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].__type__ === 'cc.Node' && entries[i]._name === parts[0]) {
        currentIdx = i;
        break;
      }
    }
  }

  if (currentIdx < 0) throw new Error(`Node not found: ${parts[0]}`);

  for (let p = 1; p < parts.length; p++) {
    const name = parts[p];
    const parent = entries[currentIdx];
    let found = -1;
    for (const child of parent._children ?? []) {
      const entry = entries[child.__id__];
      if (entry?._name === name) {
        found = child.__id__;
        break;
      }
    }
    if (found < 0) throw new Error(`Node not found: ${parts.slice(0, p + 1).join('/')}`);
    currentIdx = found;
  }

  return currentIdx;
}

function defaultTransform(nodeId: number): SceneEntry {
  return {
    __type__: 'cc.UITransform',
    _name: '',
    _objFlags: 0,
    node: { __id__: nodeId },
    _enabled: true,
  };
}

function defaultNode(name: string, parentId: number, componentIds: number[]): SceneEntry {
  return {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    _parent: { __id__: parentId },
    _children: [],
    _active: true,
    _components: componentIds.map((id) => ({ __id__: id })),
    _prefab: null,
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
  };
}

export interface AddSceneNodeResult {
  scenePath: string;
  nodePath: string;
  nodeId: number;
  staged: true;
}

export function addSceneNodeToStaging(
  projectRoot: string,
  sceneRelPath: string,
  parentPath: string,
  nodeName: string,
): AddSceneNodeResult {
  const full = join(projectRoot, sceneRelPath);
  const entries = loadEntries(full);
  const parentIdx = findNodeIndexByPath(entries, parentPath);

  const nodeId = entries.length;
  const transformId = nodeId + 1;
  const nodePath = parentPath ? `${parentPath}/${nodeName}` : nodeName;

  entries.push(defaultNode(nodeName, parentIdx, [transformId]));
  entries.push(defaultTransform(nodeId));

  const parent = entries[parentIdx];
  parent._children = [...(parent._children ?? []), { __id__: nodeId }];

  stageWriteFile(projectRoot, sceneRelPath, saveEntries(entries));

  return { scenePath: sceneRelPath, nodePath, nodeId, staged: true };
}

export interface UpdateComponentResult {
  scenePath: string;
  nodePath: string;
  componentType: string;
  staged: true;
}

export function updateSceneComponentInStaging(
  projectRoot: string,
  sceneRelPath: string,
  nodePath: string,
  componentType: string,
  properties: Record<string, unknown>,
): UpdateComponentResult {
  const full = join(projectRoot, sceneRelPath);
  const entries = loadEntries(full);
  const nodeIdx = findNodeIndexByPath(entries, nodePath);
  const node = entries[nodeIdx];

  let compIdx = -1;
  for (const ref of node._components ?? []) {
    const entry = entries[ref.__id__];
    if (entry?.__type__ === componentType) {
      compIdx = ref.__id__;
      break;
    }
  }

  if (compIdx < 0) {
    compIdx = entries.length;
    entries.push({
      __type__: componentType,
      _name: '',
      _objFlags: 0,
      node: { __id__: nodeIdx },
      _enabled: true,
      ...properties,
    });
    node._components = [...(node._components ?? []), { __id__: compIdx }];
  } else {
    const comp = entries[compIdx];
    Object.assign(comp, properties);
  }

  stageWriteFile(projectRoot, sceneRelPath, saveEntries(entries));

  return { scenePath: sceneRelPath, nodePath, componentType, staged: true };
}
