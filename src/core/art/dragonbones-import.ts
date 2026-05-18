import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWriteFile } from '../staging/patch-manager.js';

export function importDragonBonesToStaging(
  projectRoot: string,
  jsonPath: string,
): { name: string; stagedPrefab: string } {
  const abs = join(projectRoot, jsonPath);
  if (!existsSync(abs)) throw new Error(`DragonBones JSON not found: ${jsonPath}`);
  const data = JSON.parse(readFileSync(abs, 'utf8')) as { name?: string };
  const name = data.name ?? 'DragonBonesActor';
  const rel = `assets/prefabs/${name}.dragonbones.prefab.json`;
  stageWriteFile(
    projectRoot,
    rel,
    JSON.stringify({ type: 'dragonBones.ArmatureDisplay', armatureJson: jsonPath }, null, 2),
  );
  return { name, stagedPrefab: rel };
}
