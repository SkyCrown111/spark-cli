import { readFileSync, existsSync } from 'node:fs';
import { SparkCLIError } from '../../utils/errors.js';

export interface SketchLayer {
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: SketchLayer[];
}

export interface SketchDocument {
  name?: string;
  width?: number;
  height?: number;
  layers?: SketchLayer[];
}

function describeLayer(layer: SketchLayer, depth = 0): string[] {
  const indent = '  '.repeat(depth);
  const geom =
    layer.width != null
      ? ` @(${layer.x ?? 0},${layer.y ?? 0}) ${layer.width}x${layer.height ?? 0}`
      : '';
  const lines = [`${indent}- ${layer.type ?? 'layer'}: ${layer.name ?? 'Unnamed'}${geom}`];
  for (const child of layer.children ?? []) {
    if (depth < 5) lines.push(...describeLayer(child, depth + 1));
  }
  return lines;
}

export function parseSketchJson(filePath: string): SketchDocument {
  if (!existsSync(filePath)) {
    throw new SparkCLIError(`Sketch JSON not found: ${filePath}`, 1);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as SketchDocument;
  } catch {
    throw new SparkCLIError(`Invalid Sketch JSON: ${filePath}`, 1);
  }
}

export function sketchToDesignSummary(doc: SketchDocument): string {
  const lines: string[] = [
    `Sketch artboard: ${doc.name ?? 'Untitled'}`,
    doc.width != null ? `Size: ${doc.width}x${doc.height}` : '',
  ].filter(Boolean);

  for (const layer of doc.layers ?? []) {
    lines.push(...describeLayer(layer, 0));
  }

  if (!doc.layers?.length) {
    lines.push('(no layers in export)');
  }

  return lines.join('\n');
}
