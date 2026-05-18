import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { detectUnityProject } from './detector.js';

describe('unity detector', () => {
  it('detects unity-mini fixture', () => {
    const root = join(process.cwd(), 'fixtures/unity-mini');
    const info = detectUnityProject(root);
    expect(info).not.toBeNull();
    expect(info?.version).toMatch(/2022/);
  });
});
