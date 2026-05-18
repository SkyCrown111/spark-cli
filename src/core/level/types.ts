export interface LevelZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface LevelPath {
  id: string;
  points: [number, number][];
}

export interface LevelEntity {
  type: string;
  zoneId: string;
  count?: number;
  props?: Record<string, string | number | boolean>;
}

export interface LevelData {
  version: 1;
  name: string;
  description?: string;
  zones: LevelZone[];
  paths: LevelPath[];
  entities: LevelEntity[];
  meta?: Record<string, string>;
}

export function validateLevelData(data: unknown): data is LevelData {
  if (!data || typeof data !== 'object') return false;
  const d = data as LevelData;
  return d.version === 1 && typeof d.name === 'string' && Array.isArray(d.zones) && Array.isArray(d.paths);
}
