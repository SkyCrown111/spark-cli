import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyStaging,
  clearStaging,
  hasStaging,
  initStaging,
  showDiff,
  stageDeleteFile,
  stageWriteBuffer,
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

  it('rejects paths that escape the project root', () => {
    initStaging(root);
    expect(() => stageWriteFile(root, '../escape.txt', 'nope')).toThrow(SparkCLIError);
  });

  it('applies binary staged files without utf8 corruption', () => {
    initStaging(root);
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    stageWriteBuffer(root, 'assets/textures/icon.png', pngBytes);

    const diff = showDiff(root);
    expect(diff).toContain('Binary file assets/textures/icon.png');

    const applied = applyStaging(root, { yes: true });
    expect(applied).toEqual(['assets/textures/icon.png']);
    expect(readFileSync(join(root, 'assets/textures/icon.png'))).toEqual(pngBytes);
  });

  it('stages and applies file deletions', () => {
    mkdirSync(join(root, 'assets/data'), { recursive: true });
    writeFileSync(join(root, 'assets/data/remove-me.txt'), 'gone soon\n', 'utf8');

    stageDeleteFile(root, 'assets/data/remove-me.txt');
    const diff = showDiff(root);
    expect(diff).toContain('remove-me.txt');
    expect(diff).toContain('(deleted)');

    const applied = applyStaging(root, { yes: true });
    expect(applied).toEqual(['assets/data/remove-me.txt']);
    expect(existsSync(join(root, 'assets/data/remove-me.txt'))).toBe(false);
  });
});
