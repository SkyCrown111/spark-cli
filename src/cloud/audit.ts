import { loadGlobalConfig } from '../config/load.js';
import { cloudAppendAudit } from './client.js';
import { getCloudEndpoint } from './config.js';
import { loadCloudSession } from './session.js';
import { projectCloudId } from './sync.js';
import type { ReplayEvent } from '../core/replay/log.js';

export async function maybeSyncReplayToCloud(
  projectRoot: string,
  event: ReplayEvent,
): Promise<void> {
  const global = loadGlobalConfig();
  if (!global.cloud?.enabled) return;
  const session = loadCloudSession();
  if (!session) return;
  await cloudAppendAudit(
    projectCloudId(projectRoot),
    { at: event.at, type: event.type, data: event.data },
    session.accessToken,
    getCloudEndpoint(global),
  );
}
