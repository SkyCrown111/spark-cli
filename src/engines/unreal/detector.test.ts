import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectUnrealProject } from './detector.js';

describe('detectUnrealProject', () => {
  it('detects unreal-mini fixture', () => {
    const root = join(process.cwd(), 'fixtures/unreal-mini');
    const info = detectUnrealProject(root);
    expect(info?.projectName).toBe('SparkCLI');
  });
});
