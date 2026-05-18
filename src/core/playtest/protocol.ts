/**
 * Playtest session format (input replay + RNG seed + events).
 */

export interface PlaytestInputEvent {
  t: number;
  type: 'key' | 'pointer' | 'axis';
  code: string;
  value?: number;
}

export interface PlaytestSession {
  version: 1;
  engine: string;
  scene: string;
  rngSeed: number;
  durationMs: number;
  inputs: PlaytestInputEvent[];
  checkpoints: { t: number; label: string; stateHash?: string }[];
}

export function createPlaytestSession(partial: Partial<PlaytestSession> = {}): PlaytestSession {
  return {
    version: 1,
    engine: partial.engine ?? 'cocos-creator',
    scene: partial.scene ?? 'assets/scenes/main.scene',
    rngSeed: partial.rngSeed ?? 42,
    durationMs: partial.durationMs ?? 0,
    inputs: partial.inputs ?? [],
    checkpoints: partial.checkpoints ?? [],
  };
}

export function serializePlaytestSession(session: PlaytestSession): string {
  return JSON.stringify(session, null, 2) + '\n';
}

export function parsePlaytestSession(raw: string): PlaytestSession {
  const data = JSON.parse(raw) as PlaytestSession;
  if (data.version !== 1) throw new Error(`Unsupported playtest version: ${data.version}`);
  return data;
}

/** Stable hash for compare (djb2). */
export function hashPlaytestState(payload: unknown): string {
  const s = JSON.stringify(payload);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
