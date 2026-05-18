import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readStagingSnapshot, writeStagedFile } from './staging-sync.js';

describe('staging-sync', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-editor-'));
    mkdirSync(join(root, 'assets', 'levels'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips staged files', () => {
    writeStagedFile(root, 'assets/levels/test.json', '{"version":1}\n');
    const snap = readStagingSnapshot(root);
    expect(snap.manifest?.files.length).toBe(1);
    expect(snap.files['assets/levels/test.json']).toContain('version');
  });
});
