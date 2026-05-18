import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { SparkCLIError } from '../../utils/errors.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function imageToDataUrl(imagePath: string): { dataUrl: string; mime: string; bytes: number } {
  if (!existsSync(imagePath)) {
    throw new SparkCLIError(`Image not found: ${imagePath}`, 1);
  }
  const ext = extname(imagePath).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    throw new SparkCLIError(`Unsupported image type: ${ext}`, 1, [
      'Use .png, .jpg, .webp, or .gif',
    ]);
  }
  const buf = readFileSync(imagePath);
  const b64 = buf.toString('base64');
  return {
    dataUrl: `data:${mime};base64,${b64}`,
    mime,
    bytes: buf.length,
  };
}
