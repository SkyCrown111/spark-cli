import { readFileSync } from 'node:fs';

export interface GodotSceneNode {
  name: string;
  type: string;
  parent?: string;
}

export interface GodotSceneAnalysis {
  path: string;
  nodes: GodotSceneNode[];
}

export function parseGodotScene(filePath: string): GodotSceneAnalysis {
  const text = readFileSync(filePath, 'utf8');
  const nodes: GodotSceneNode[] = [];
  const nodeRe = /^\[node name="([^"]+)" type="([^"]+)"(?: parent="([^"]+)")?/gm;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(text)) !== null) {
    nodes.push({ name: m[1]!, type: m[2]!, parent: m[3] });
  }
  return { path: filePath, nodes };
}

export function sceneToMcpTree(analysis: GodotSceneAnalysis): {
  path: string;
  nodeCount: number;
  nodes: GodotSceneNode[];
} {
  return {
    path: analysis.path,
    nodeCount: analysis.nodes.length,
    nodes: analysis.nodes,
  };
}
