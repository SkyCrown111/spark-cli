import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startEditorServer } from './server.js';
import { readStagingSnapshot } from './staging-sync.js';

describe('startEditorServer', () => {
  let root: string;
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('serves health and staging API', async () => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-srv-'));
    mkdirSync(join(root, '.spark'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');

    const srv = await startEditorServer({ projectRoot: root, port: 0 });
    close = srv.close;
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/health`);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns staging entries with action metadata', async () => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-srv-'));
    mkdirSync(join(root, '.spark'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');

    const srv = await startEditorServer({ projectRoot: root, port: 0 });
    close = srv.close;
    const origin = `http://127.0.0.1:${srv.port}`;
    await fetch(`${origin}/api/staging/file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({ path: 'assets/levels/test.json', content: '{"ok":true}\n' }),
    });

    const res = await fetch(`${origin}/api/staging`);
    const body = (await res.json()) as {
      entries: Array<{ path: string; action: string; kind?: string }>;
      files: Record<string, string>;
    };

    expect(body.entries).toContainEqual(
      expect.objectContaining({ path: 'assets/levels/test.json', action: 'create', kind: 'text' }),
    );
    expect(body.files['assets/levels/test.json']).toContain('"ok":true');
  });

  it('blocks cross-origin writes to staging', async () => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-srv-'));
    mkdirSync(join(root, '.spark'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');

    const srv = await startEditorServer({ projectRoot: root, port: 0 });
    close = srv.close;
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/staging/file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ path: 'assets/levels/test.json', content: '{"ok":true}\n' }),
    });

    expect(res.status).toBe(403);
    expect(readStagingSnapshot(root).manifest).toBeNull();
  });

  it('rejects project-escaping staged paths', async () => {
    root = mkdtempSync(join(tmpdir(), 'spark-cli-srv-'));
    mkdirSync(join(root, '.spark'), { recursive: true });
    writeFileSync(join(root, 'spark-cli.config.yaml'), 'project:\n  engine: cocos-creator\n');

    const srv = await startEditorServer({ projectRoot: root, port: 0 });
    close = srv.close;
    const origin = `http://127.0.0.1:${srv.port}`;
    const res = await fetch(`${origin}/api/staging/file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({ path: '../escape.txt', content: 'bad' }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('project root');
    expect(readStagingSnapshot(root).manifest).toBeNull();
  });
});
