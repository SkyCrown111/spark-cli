import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { checkSceneIntegrity } from './scene-integrity.js';

describe('scene-integrity', () => {
  it('passes valid fixture scene', () => {
    const root = join(process.cwd(), 'fixtures/cocos-3.8-mini');
    const issues = checkSceneIntegrity(root);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
