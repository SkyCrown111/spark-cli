import type { LevelData } from './types.js';

/** Apply a simple natural-language patch without LLM. */
export function patchLevelFromHint(level: LevelData, hint: string): LevelData {
  const next: LevelData = JSON.parse(JSON.stringify(level)) as LevelData;

  if (/伏击|ambush/i.test(hint)) {
    const zone = next.zones.find((z) => z.id === 'mid') ?? next.zones[0];
    if (zone) {
      next.entities.push({ type: 'ambush', zoneId: zone.id, count: 2 });
    }
  }

  if (/boss|首领/i.test(hint) && !next.zones.some((z) => z.id === 'boss')) {
    next.zones.push({ id: 'boss', x: 420, y: 60, w: 120, h: 120, label: 'Boss' });
    next.entities.push({ type: 'boss', zoneId: 'boss', count: 1 });
    next.paths.push({
      id: 'boss-route',
      points: [
        [0, 0],
        [200, 80],
        [420, 100],
      ],
    });
  }

  const countMatch = hint.match(/(\d+)\s*(处|个)?\s*(伏击|敌人|enemy)/i);
  if (countMatch) {
    const n = parseInt(countMatch[1]!, 10);
    next.entities.push({ type: 'enemy_patrol', zoneId: 'mid', count: n });
  }

  next.meta = { ...next.meta, lastPatch: hint.slice(0, 200) };
  return next;
}
