import { describe, it, expect } from 'vitest';
import { buildLevelTemplate } from './template.js';
import { validateLevelData } from './types.js';

describe('buildLevelTemplate', () => {
  it('creates zones and paths from hint', () => {
    const level = buildLevelTemplate('forest', '3条路径 Boss房在北侧');
    expect(validateLevelData(level)).toBe(true);
    expect(level.zones.some((z) => z.id === 'boss')).toBe(true);
    expect(level.paths.length).toBeGreaterThanOrEqual(2);
  });

  it('adds ambush entities when hinted', () => {
    const level = buildLevelTemplate('test', '两处伏击');
    expect(level.entities.some((e) => e.type === 'ambush')).toBe(true);
  });

  it('uses kebab name', () => {
    const level = buildLevelTemplate('Forest Level', '');
    expect(level.name).toBe('forest-level');
  });
});
