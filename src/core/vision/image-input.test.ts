import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { imageToDataUrl } from './image-input.js';

describe('image-input', () => {
  it('encodes minimal PNG to data URL', () => {
    const dir = join(process.cwd(), 'fixtures/ui-input');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, '_test-tiny.png');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(path, png);
    const { dataUrl, mime } = imageToDataUrl(path);
    expect(mime).toBe('image/png');
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    rmSync(path);
  });
});
