/**
 * Spine JSON → staged engine prefab placeholder.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWriteFile } from '../staging/patch-manager.js';

export interface SpineImportResult {
  skeleton: string;
  stagedPrefab: string;
  engine: 'cocos' | 'unity';
}

export function importSpineToStaging(
  projectRoot: string,
  spineJsonPath: string,
  engine: 'cocos' | 'unity' = 'cocos',
): SpineImportResult {
  const abs = join(projectRoot, spineJsonPath);
  if (!existsSync(abs)) throw new Error(`Spine JSON not found: ${spineJsonPath}`);
  const data = JSON.parse(readFileSync(abs, 'utf8')) as { skeleton?: { name?: string } };
  const name = data.skeleton?.name ?? 'SpineCharacter';

  const relOut =
    engine === 'unity'
      ? `Assets/Prefabs/${name}.prefab.json`
      : `assets/prefabs/${name}.spine.prefab.json`;

  const body =
    engine === 'unity'
      ? JSON.stringify(
          {
            type: 'SkeletonAnimation',
            skeletonDataAsset: spineJsonPath,
            note: 'Placeholder — wire SkeletonDataAsset in Unity Editor',
          },
          null,
          2,
        )
      : JSON.stringify(
          {
            type: 'sp.Skeleton',
            skeletonJson: spineJsonPath,
            note: 'Placeholder — assign skeleton data in Cocos',
          },
          null,
          2,
        );

  stageWriteFile(projectRoot, relOut, body);
  return { skeleton: name, stagedPrefab: relOut, engine };
}
