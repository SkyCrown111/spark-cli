/**
 * Minimal Tiled TMX → unified tilemap IR.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TilemapLayerIR {
  name: string;
  width: number;
  height: number;
  tiles: number[];
  collision?: boolean;
}

export interface TilemapIR {
  source: string;
  tileWidth: number;
  tileHeight: number;
  layers: TilemapLayerIR[];
}

export function parseTmx(xml: string, source = 'map.tmx'): TilemapIR {
  const tileWidth = Number(/<map[^>]*tilewidth="(\d+)"/i.exec(xml)?.[1] ?? 32);
  const tileHeight = Number(/<map[^>]*tileheight="(\d+)"/i.exec(xml)?.[1] ?? 32);
  const layers: TilemapLayerIR[] = [];

  const layerRe = /<layer[^>]*name="([^"]*)"[^>]*width="(\d+)"[^>]*height="(\d+)"[^>]*>([\s\S]*?)<\/layer>/gi;
  let m: RegExpExecArray | null;
  while ((m = layerRe.exec(xml)) !== null) {
    const [, name, w, h, body] = m;
    const dataMatch = /<data[^>]*>([\s\S]*?)<\/data>/i.exec(body);
    const csv = (dataMatch?.[1] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const collision = /collision|block/i.test(name);
    layers.push({
      name,
      width: Number(w),
      height: Number(h),
      tiles: csv,
      collision,
    });
  }

  return { source, tileWidth, tileHeight, layers };
}

export function importTmxFile(projectRoot: string, relPath: string): TilemapIR {
  const abs = join(projectRoot, relPath);
  if (!existsSync(abs)) throw new Error(`TMX not found: ${relPath}`);
  return parseTmx(readFileSync(abs, 'utf8'), relPath);
}
