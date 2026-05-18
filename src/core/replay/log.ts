import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';

export type ReplayEventType =
  | 'generate'
  | 'apply'
  | 'revert'
  | 'validate'
  | 'command'
  | 'tool_call'
  | 'agent_iteration'
  | 'compaction'
  | 'subagent_spawn'
  | 'hook_fired'
  | 'skill_load'
  | 'plan_enter'
  | 'plan_exit';

export interface ReplayEvent {
  at: string;
  type: ReplayEventType;
  data: Record<string, unknown>;
}

function logPath(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'replay-log.jsonl');
}

export function appendReplayEvent(
  projectRoot: string,
  type: ReplayEventType,
  data: Record<string, unknown>,
): void {
  const dir = getProjectSparkDir(projectRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const event: ReplayEvent = { at: new Date().toISOString(), type, data };
  appendFileSync(logPath(projectRoot), `${JSON.stringify(event)}\n`, 'utf8');

  import('../../cloud/audit.js')
    .then(({ maybeSyncReplayToCloud }) => maybeSyncReplayToCloud(projectRoot, event))
    .catch(() => undefined);
}

export function readReplayEvents(projectRoot: string): ReplayEvent[] {
  const path = logPath(projectRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReplayEvent);
}
