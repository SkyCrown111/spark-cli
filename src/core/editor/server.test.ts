import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startEditorServer } from './server.js';

describe('startEditorServer', () => {
  let root: string;
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('serves health and staging API', async () => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-srv-'));
    mkdirSync(join(root, '.spark-cli'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');

    const srv = await startEditorServer({ projectRoot: root, port: 0 });
    close = srv.close;
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/health`);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
