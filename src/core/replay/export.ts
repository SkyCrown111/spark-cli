import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMergedConfig } from '../../config/load.js';
import { scanProjectContext } from '../context/project-scanner.js';
import {
  hasStaging,
  loadManifest,
  showDiff,
} from '../staging/patch-manager.js';
import { readReplayEvents } from './log.js';
import { detectCocosProject } from '../../engines/cocos/detector.js';
import { detectUnityProject } from '../../engines/unity/detector.js';

export interface ReplayExport {
  version: 1;
  exportedAt: string;
  projectRoot: string;
  engine: string;
  engineVersion?: string;
  events: ReturnType<typeof readReplayEvents>;
  staging?: {
    manifest: unknown;
    diff: string;
  };
}

export async function buildReplayExport(projectRoot: string): Promise<ReplayExport> {
  const config = await loadMergedConfig(projectRoot);
  const ctx = scanProjectContext(projectRoot);
  const cocos = detectCocosProject(projectRoot);
  const unity = detectUnityProject(projectRoot);

  const out: ReplayExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projectRoot,
    engine: config.project?.engine ?? ctx.engine,
    engineVersion: unity?.version ?? cocos?.version ?? ctx.engineVersion,
    events: readReplayEvents(projectRoot),
  };

  if (hasStaging(projectRoot)) {
    out.staging = {
      manifest: loadManifest(projectRoot),
      diff: showDiff(projectRoot),
    };
  }

  return out;
}

export async function exportReplay(
  projectRoot: string,
  outputPath?: string,
): Promise<string> {
  const replay = await buildReplayExport(projectRoot);
  const dest = outputPath ?? join(projectRoot, 'replay.json');
  writeFileSync(dest, JSON.stringify(replay, null, 2), 'utf8');
  return dest;
}
