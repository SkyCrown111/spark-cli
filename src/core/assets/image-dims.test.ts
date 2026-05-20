import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readImageDimensions, readImageDimensionsHeader, getImageDimBackend } from './image-dims.js';

function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrBody = Buffer.alloc(13);
  ihdrBody.writeUInt32BE(width, 0);
  ihdrBody.writeUInt32BE(height, 4);
  const ihdr = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    ihdrBody,
    Buffer.from([0, 0, 0, 0]),
  ]);
  return Buffer.concat([sig, ihdr]);
}

describe('image-dims', () => {
  it('header path reads png dimensions', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gcli-img-dims-'));
    try {
      const path = join(tmp, 't.png');
      writeFileSync(path, makePng(128, 64));
      const dims = readImageDimensionsHeader(path, '.png');
      expect(dims).toEqual({ width: 128, height: 64 });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('readImageDimensions falls back to header', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gcli-img-dims-'));
    try {
      const path = join(tmp, 't.png');
      writeFileSync(path, makePng(32, 32));
      const dims = await readImageDimensions(path, '.png');
      expect(dims?.width).toBe(32);
      expect(dims?.source === 'sharp' || dims?.source === 'header').toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('getImageDimBackend is sharp or header', () => {
    expect(['sharp', 'header']).toContain(getImageDimBackend());
  });
});
