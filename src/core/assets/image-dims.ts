/**
 * Image dimension probing: optional `sharp` (WebP/PNG/JPEG) with header-sniff fallback.
 */

import { readFileSync } from 'node:fs';
import { probeOptionalRequire, tryImportOptional } from '../../utils/optional-module.js';

export type ImageDimBackend = 'sharp' | 'header';

export interface ImageDims {
  width: number;
  height: number;
  /** How dimensions were obtained (for diagnostics). */
  source?: ImageDimBackend;
}

let sharpLoader: Promise<SharpFn | null> | undefined;

type SharpFn = (input: string) => { metadata: () => Promise<{ width?: number; height?: number }> };

async function loadSharp(): Promise<SharpFn | null> {
  if (sharpLoader === undefined) {
    sharpLoader = (async () => {
      const hit = await tryImportOptional<unknown>('sharp');
      if (!hit.ok) return null;
      const mod = hit.module as SharpFn | { default: SharpFn };
      const fn = typeof mod === 'function' ? mod : mod.default;
      return typeof fn === 'function' ? fn : null;
    })();
  }
  return sharpLoader;
}

export function getImageDimBackend(): ImageDimBackend {
  return probeOptionalRequire('sharp').ok ? 'sharp' : 'header';
}

export function isSharpInstalled(): boolean {
  return probeOptionalRequire('sharp').ok;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export async function readImageDimensions(
  full: string,
  ext: string,
): Promise<ImageDims | null> {
  const normalized = ext.toLowerCase();
  if (!IMAGE_EXTS.has(normalized)) return null;

  const sharp = await loadSharp();
  if (sharp) {
    try {
      const meta = await sharp(full).metadata();
      if (meta.width && meta.height) {
        return { width: meta.width, height: meta.height, source: 'sharp' };
      }
    } catch {
      /* fall through to header sniff */
    }
  }

  const header = readImageDimensionsHeader(full, normalized);
  if (header) header.source = 'header';
  return header;
}

export function readImageDimensionsHeader(full: string, ext: string): ImageDims | null {
  let buf: Buffer;
  try {
    buf = readFileSync(full);
  } catch {
    return null;
  }
  if (ext === '.png') return readPngDims(buf);
  if (ext === '.jpg' || ext === '.jpeg') return readJpgDims(buf);
  return null;
}

function readPngDims(buf: Buffer): ImageDims | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function readJpgDims(buf: Buffer): ImageDims | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    let marker = buf[i + 1];
    if (marker === undefined) return null;
    while (marker === 0xff && i + 1 < buf.length) {
      i++;
      marker = buf[i + 1];
      if (marker === undefined) return null;
    }
    i += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (i + 1 >= buf.length) return null;
    const segLen = buf.readUInt16BE(i);
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSOF) {
      const height = buf.readUInt16BE(i + 3);
      const width = buf.readUInt16BE(i + 5);
      return { width, height };
    }
    i += segLen;
  }
  return null;
}
