import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expandAtReferences } from './at-refs.js';

describe('expandAtReferences', () => {
  it('passes through when no @ refs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-cli-at-'));
    const r = expandAtReferences(dir, 'hello world');
    expect(r.agentText).toBe('hello world');
    expect(r.refs).toEqual([]);
  });

  it('inlines file content for @path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-cli-at-'));
    writeFileSync(join(dir, 'foo.ts'), 'export const x = 1;', 'utf8');
    const r = expandAtReferences(dir, 'fix @foo.ts please');
    expect(r.refs).toContain('foo.ts');
    expect(r.agentText).toContain('export const x = 1');
    expect(r.agentText).toContain('fix @foo.ts please');
  });

  it('lists directory entries for @dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-cli-at-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), '', 'utf8');
    const r = expandAtReferences(dir, 'scan @src');
    expect(r.agentText).toContain('a.ts');
  });
});
