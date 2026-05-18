import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWriteFile } from '../staging/patch-manager.js';

export function importLottieToStaging(
  projectRoot: string,
  lottiePath: string,
): { name: string; stagedPrefab: string } {
  const abs = join(projectRoot, lottiePath);
  if (!existsSync(abs)) throw new Error(`Lottie JSON not found: ${lottiePath}`);
  const data = JSON.parse(readFileSync(abs, 'utf8')) as { nm?: string };
  const name = (data.nm ?? 'LottieClip').replace(/\W+/g, '_');
  const rel = `assets/ui/${name}.lottie.json`;
  stageWriteFile(
    projectRoot,
    rel,
    JSON.stringify({ type: 'LottieAnimation', source: lottiePath, fps: 30 }, null, 2),
  );
  return { name, stagedPrefab: rel };
}
