import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageWriteFile } from './patch-manager.js';
import { summarizeStagedFileDiff } from './inline-diff.js';

describe('summarizeStagedFileDiff', () => {
  it('summarizes a staged file change', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-cli-diff-'));
    mkdirSync(join(root, '.spark-cli', 'staging', 'files'), { recursive: true });
    writeFileSync(join(root, 'hello.txt'), 'old line\n', 'utf8');
    stageWriteFile(root, 'hello.txt', 'new line\n');
    const summary = summarizeStagedFileDiff(root, 'hello.txt');
    expect(summary).toContain('hello.txt');
    expect(summary).toMatch(/\+|-/);
  });
});
