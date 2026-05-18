/**
 * Simple grid sprite atlas packer (no optional deps).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { stageWriteFile } from '../staging/patch-manager.js';

export interface AtlasSpriteInput {
  name: string;
  width: number;
  height: number;
  /** PNG bytes or path hint */
  sourcePath?: string;
}

export interface AtlasPackResult {
  width: number;
  height: number;
  sprites: { name: string; x: number; y: number; w: number; h: number }[];
  format: 'cocos-plist' | 'json';
  stagedPath: string;
}

/** Naive row packer — places sprites left-to-right, wraps rows. */
export function packAtlasGrid(sprites: AtlasSpriteInput[], pad = 2): Omit<AtlasPackResult, 'stagedPath' | 'format'> {
  let x = pad;
  let y = pad;
  let rowH = 0;
  let maxW = 0;
  let maxY = pad;
  const placed: AtlasPackResult['sprites'] = [];

  for (const s of sprites) {
    if (x + s.width + pad > 2048) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ name: s.name, x, y, w: s.width, h: s.height });
    rowH = Math.max(rowH, s.height);
    maxW = Math.max(maxW, x + s.width + pad);
    maxY = Math.max(maxY, y + s.height + pad);
    x += s.width + pad;
  }

  return { width: maxW, height: maxY, sprites: placed };
}

export function atlasToCocosPlist(result: Omit<AtlasPackResult, 'stagedPath' | 'format'>, textureName: string): string {
  const frames: Record<string, unknown> = {};
  for (const s of result.sprites) {
    frames[`${s.name}.png`] = {
      frame: `{{${s.x},${s.y}},{${s.w},${s.h}}}`,
      offset: '{0,0}',
      rotated: false,
      sourceSize: `{${s.w},${s.h}}`,
    };
  }
  return JSON.stringify(
    {
      frames,
      meta: {
        image: textureName,
        size: `{${result.width},${result.height}}`,
        format: 3,
      },
    },
    null,
    2,
  );
}

export function stageAtlasManifest(
  projectRoot: string,
  relOut: string,
  sprites: AtlasSpriteInput[],
): AtlasPackResult {
  const packed = packAtlasGrid(sprites);
  const plist = atlasToCocosPlist(packed, basename(relOut).replace(/\.plist$/, '.png'));
  stageWriteFile(projectRoot, relOut, plist);
  return { ...packed, format: 'cocos-plist', stagedPath: relOut };
}

/** Read PNG dimensions from IHDR (offset 16). */
export function readPngDimensions(absPath: string): { width: number; height: number } | null {
  if (!existsSync(absPath)) return null;
  const buf = readFileSync(absPath);
  if (buf.length < 24 || buf[0] !== 0x89) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

export function spritesFromDirectory(projectRoot: string, dir: string): AtlasSpriteInput[] {
  const root = join(projectRoot, dir);
  if (!existsSync(root)) return [];
  const out: AtlasSpriteInput[] = [];
  for (const name of readdirSync(root)) {
    if (!/\.png$/i.test(name)) continue;
    const full = join(root, name);
    if (!statSync(full).isFile()) continue;
    const dim = readPngDimensions(full);
    if (!dim) continue;
    out.push({
      name: name.replace(/\.png$/i, ''),
      width: dim.width,
      height: dim.height,
      sourcePath: join(dir, name).replace(/\\/g, '/'),
    });
  }
  return out;
}
