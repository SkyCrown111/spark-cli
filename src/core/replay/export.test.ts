import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFileSync, rmSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { appendReplayEvent } from './log.js';
import { exportReplay } from './export.js';
import { stageWriteFile, initStaging } from '../staging/patch-manager.js';

describe('replay export', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-replay-'));
    mkdirSync(join(root, '.spark-cli'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('exports events and staging', async () => {
    appendReplayEvent(root, 'command', { name: 'test' });
    initStaging(root);
    stageWriteFile(root, 'assets/scripts/ReplayTest.ts', '// test\n');

    const out = join(root, 'replay-export-test.json');
    await exportReplay(root, out);
    const replay = JSON.parse(readFileSync(out, 'utf8'));
    expect(replay.version).toBe(1);
    expect(replay.events.length).toBeGreaterThan(0);
    expect(replay.staging?.diff).toContain('ReplayTest');
  });
});
