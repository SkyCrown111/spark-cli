import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyStaging,
  clearStaging,
  hasStaging,
  initStaging,
  showDiff,
  stageWriteFile,
} from './patch-manager.js';
import { SparkCLIError } from '../../utils/errors.js';

describe('patch-manager', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-staging-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('stages and applies a new file', () => {
    initStaging(root);
    stageWriteFile(root, 'assets/scripts/Test.ts', '// @spark-cli-generated\nexport const x = 1;\n');
    expect(hasStaging(root)).toBe(true);
    const diff = showDiff(root);
    expect(diff).toContain('Test.ts');

    const applied = applyStaging(root, { yes: true });
    expect(applied).toEqual(['assets/scripts/Test.ts']);
    expect(readFileSync(join(root, 'assets/scripts/Test.ts'), 'utf8')).toContain('x = 1');
    expect(hasStaging(root)).toBe(false);
  });

  it('revert clears staging', () => {
    initStaging(root);
    stageWriteFile(root, 'a.ts', 'a');
    clearStaging(root);
    expect(hasStaging(root)).toBe(false);
  });

  it('apply without staging throws', () => {
    expect(() => applyStaging(root, { yes: true })).toThrow(SparkCLIError);
  });
});
