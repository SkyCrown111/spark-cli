import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseGodotScene } from './scene-parser.js';

describe('parseGodotScene', () => {
  it('parses main.tscn nodes', () => {
    const path = join(process.cwd(), 'fixtures/godot-mini/scenes/main.tscn');
    const analysis = parseGodotScene(path);
    expect(analysis.nodes.some((n) => n.name === 'Main')).toBe(true);
  });
});
