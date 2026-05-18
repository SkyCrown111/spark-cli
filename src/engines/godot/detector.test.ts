import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectGodotProject } from './detector.js';

describe('detectGodotProject', () => {
  it('detects godot-mini fixture', () => {
    const root = join(process.cwd(), 'fixtures/godot-mini');
    expect(detectGodotProject(root)).not.toBeNull();
  });
});
