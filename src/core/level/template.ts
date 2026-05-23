import type { LevelData, LevelEntity, LevelPath, LevelZone } from './types.js';

function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'level'
  );
}

/** Deterministic level scaffold from a short natural-language hint (no LLM). */
export function buildLevelTemplate(name: string, hint = ''): LevelData {
  const id = slug(name);
  const wantsBoss = /boss|首领|北侧|north/i.test(hint);
  const pathNumMatch = hint.match(/(\d+)\s*条?\s*(路径|path|route)/i);
  const pathCount = pathNumMatch
    ? Math.min(4, Math.max(1, parseInt(pathNumMatch[1]!, 10)))
    : Math.min(4, Math.max(1, (hint.match(/路径|path|route/gi) ?? []).length || 2));

  const zones: LevelZone[] = [
    { id: 'spawn', x: 0, y: 0, w: 120, h: 80, label: 'Spawn' },
    { id: 'mid', x: 200, y: 120, w: 160, h: 120, label: 'Mid' },
  ];
  if (wantsBoss) {
    zones.push({ id: 'boss', x: 400, y: 40, w: 140, h: 140, label: 'Boss' });
  }

  const paths: LevelPath[] = [];
  for (let i = 0; i < pathCount; i++) {
    const offset = i * 40;
    paths.push({
      id: `route-${i + 1}`,
      points: [
        [0 + offset, 0],
        [120 + offset, 60],
        [240 + offset, wantsBoss ? 80 : 140],
        ...(wantsBoss ? ([[400, 80]] as [number, number][]) : []),
      ],
    });
  }

  const entities: LevelEntity[] = [
    { type: 'player_spawn', zoneId: 'spawn', count: 1 },
    { type: 'enemy_patrol', zoneId: 'mid', count: 2 },
  ];
  if (wantsBoss) {
    entities.push({ type: 'boss', zoneId: 'boss', count: 1, props: { phase: 1 } });
  }
  if (/伏击|ambush/i.test(hint)) {
    entities.push({ type: 'ambush', zoneId: 'mid', count: 2 });
  }

  return {
    version: 1,
    name: id,
    description: hint || `Generated level: ${name}`,
    zones,
    paths,
    entities,
    meta: { generatedBy: 'spark-cli', template: '1' },
  };
}

export function defaultLevelJsonPath(name: string): string {
  return `assets/levels/${slug(name)}.json`;
}

export function defaultLevelScriptPath(name: string): string {
  const base = slug(name)
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  return `assets/scripts/level/${base}Level.ts`;
}

export function buildCocosLevelLoaderScript(_level: LevelData, jsonRelPath: string): string {
  const className = jsonRelPath
    .replace(/^assets\/levels\//, '')
    .replace(/\.json$/, '')
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  return `// @spark-cli-generated
// path: assets/scripts/level/${className}Level.ts
import { _decorator, Component, JsonAsset, resources } from 'cc';
const { ccclass } = _decorator;

export interface LevelZone { id: string; x: number; y: number; w: number; h: number; label?: string }
export interface LevelPath { id: string; points: [number, number][] }
export interface LevelEntity { type: string; zoneId: string; count?: number }

export interface LevelData {
  version: 1;
  name: string;
  zones: LevelZone[];
  paths: LevelPath[];
  entities: LevelEntity[];
}

@ccclass('${className}Level')
export class ${className}Level extends Component {
  levelAsset: JsonAsset | null = null;

  data: LevelData | null = null;

  onLoad() {
    if (this.levelAsset?.json) {
      this.data = this.levelAsset.json as LevelData;
      return;
    }
    resources.load('${jsonRelPath.replace(/^assets\//, '').replace(/\.json$/, '')}', JsonAsset, (err, asset) => {
      if (!err && asset) this.data = asset.json as LevelData;
    });
  }

  getZone(id: string) {
    return this.data?.zones.find((z) => z.id === id);
  }
}
`;
}
