import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/** Cocos Creator 3.x serialized scene/prefab JSON array entry */
interface SceneEntry {
  __type__?: string;
  _name?: string;
  _children?: { __id__: number }[];
  _parent?: { __id__: number } | null;
  _components?: { __id__: number }[];
  node?: { __id__: number };
  [key: string]: unknown;
}

export interface SceneNodeInfo {
  path: string;
  name: string;
  type: string;
  active: boolean;
  componentTypes: string[];
  childCount: number;
}

export interface SceneAnalysis {
  file: string;
  sceneName: string;
  nodeCount: number;
  componentCount: number;
  maxDepth: number;
  nodes: SceneNodeInfo[];
  treeText: string;
  issues: string[];
}

function loadEntries(scenePath: string): SceneEntry[] {
  const raw = readFileSync(scenePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Scene file must be a JSON array (Cocos 3.x format)');
  }
  return data as SceneEntry[];
}

function componentTypeForEntry(entry: SceneEntry): string | null {
  const t = entry.__type__;
  if (!t || t === 'cc.Scene' || t === 'cc.SceneAsset' || t === 'cc.Node') return null;
  return t;
}

export function parseCocosScene(scenePath: string): SceneAnalysis {
  const entries = loadEntries(scenePath);
  const issues: string[] = [];

  const nodeIndices: number[] = [];
  const componentTypesByNode = new Map<number, string[]>();

  entries.forEach((entry, index) => {
    if (entry.__type__ === 'cc.Node') nodeIndices.push(index);
    const ct = componentTypeForEntry(entry);
    if (ct && entry.node?.__id__ != null) {
      const list = componentTypesByNode.get(entry.node.__id__) ?? [];
      list.push(ct);
      componentTypesByNode.set(entry.node.__id__, list);
    }
  });

  let sceneName = basename(scenePath, '.scene');
  const sceneEntry = entries.find((e) => e.__type__ === 'cc.Scene');
  if (sceneEntry?._name) sceneName = sceneEntry._name;

  const nodes: SceneNodeInfo[] = [];
  let maxDepth = 0;

  function walk(nodeIndex: number, pathPrefix: string, depth: number): void {
    const entry = entries[nodeIndex];
    if (!entry || entry.__type__ !== 'cc.Node') return;

    const name = entry._name ?? 'Unnamed';
    const path = pathPrefix ? `${pathPrefix}/${name}` : name;
    maxDepth = Math.max(maxDepth, depth);
    const comps = componentTypesByNode.get(nodeIndex) ?? [];

    nodes.push({
      path,
      name,
      type: 'cc.Node',
      active: entry._active !== false,
      componentTypes: comps,
      childCount: entry._children?.length ?? 0,
    });

    for (const child of entry._children ?? []) {
      if (child.__id__ >= 0 && child.__id__ < entries.length) {
        walk(child.__id__, path, depth + 1);
      } else {
        issues.push(`Invalid child __id__ ${child.__id__} under ${path}`);
      }
    }
  }

  // Find root nodes (cc.Scene children or nodes without parent on scene)
  const sceneIdx = entries.findIndex((e) => e.__type__ === 'cc.Scene');
  if (sceneIdx >= 0) {
    for (const child of entries[sceneIdx]._children ?? []) {
      walk(child.__id__, '', 1);
    }
  } else {
    for (const idx of nodeIndices) {
      const parent = entries[idx]._parent;
      if (!parent || parent.__id__ == null) {
        walk(idx, '', 1);
      }
    }
  }

  const treeLines = nodes.map((n) => {
    const depth = n.path.split('/').length - 1;
    const indent = '  '.repeat(depth);
    const comps = n.componentTypes.length ? ` [${n.componentTypes.join(', ')}]` : '';
    const inactive = n.active ? '' : ' (inactive)';
    return `${indent}${n.name}${comps}${inactive}`;
  });

  const componentCount = entries.filter((e) => componentTypeForEntry(e)).length;

  if (nodes.length === 0) {
    issues.push('No cc.Node entries found — parser may need update for this scene version');
  }

  return {
    file: scenePath,
    sceneName,
    nodeCount: nodes.length,
    componentCount,
    maxDepth,
    nodes,
    treeText: treeLines.join('\n') || '(empty)',
    issues,
  };
}

export function sceneToMcpTree(analysis: SceneAnalysis): object {
  return {
    scene: analysis.sceneName,
    file: analysis.file,
    nodeCount: analysis.nodeCount,
    nodes: analysis.nodes.map((n) => ({
      path: n.path,
      components: n.componentTypes,
      active: n.active,
    })),
  };
}
