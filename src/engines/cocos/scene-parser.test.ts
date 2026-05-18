import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseCocosScene } from './scene-parser.js';

const fixtureScene = join(
  process.cwd(),
  'fixtures/cocos-3.8-mini/assets/scenes/main.scene',
);

describe('parseCocosScene', () => {
  it('parses fixture scene tree', () => {
    const a = parseCocosScene(fixtureScene);
    expect(a.nodeCount).toBeGreaterThanOrEqual(2);
    expect(a.nodes.some((n) => n.path === 'Canvas')).toBe(true);
    expect(a.nodes.some((n) => n.path === 'Canvas/Player')).toBe(true);
    expect(a.treeText).toContain('Canvas');
  });
});
