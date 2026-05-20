import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readStagingSnapshot, writeStagedFile } from './staging-sync.js';
import { stageDeleteFile, stageWriteBuffer } from '../staging/patch-manager.js';

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

  it('summarizes binary staged files without decoding them as text', () => {
    stageWriteBuffer(root, 'assets/textures/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const snap = readStagingSnapshot(root);
    expect(snap.files['assets/textures/icon.png']).toContain('[binary file staged:');
  });

  it('includes delete entries in staging snapshots', () => {
    mkdirSync(join(root, 'assets/levels'), { recursive: true });
    writeFileSync(join(root, 'assets/levels/old.json'), '{"old":true}\n');
    stageDeleteFile(root, 'assets/levels/old.json');
    const snap = readStagingSnapshot(root);
    expect(snap.entries[0]?.action).toBe('delete');
    expect(snap.files['assets/levels/old.json']).toContain('[delete staged:');
  });
});
