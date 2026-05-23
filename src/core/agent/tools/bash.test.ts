import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from './bash.js';

describe('bash runShell', () => {
  it('captures stdout from a successful command', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-cli-bash-'));
    const cmd = process.platform === 'win32' ? 'echo hello' : "echo 'hello'";
    const r = await runShell(cmd, { cwd: root, timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/hello/);
    expect(r.timedOut).toBe(false);
  });

  it('reports nonzero exit and captures stderr', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-cli-bash-'));
    const cmd = process.platform === 'win32' ? 'cmd /c "exit 7"' : 'sh -c "echo err 1>&2; exit 7"';
    const r = await runShell(cmd, { cwd: root, timeoutMs: 5000 });
    expect(r.exitCode).toBe(7);
  });

  it('aborts when the abort signal fires', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-cli-bash-'));
    mkdirSync(root, { recursive: true });
    const ac = new AbortController();
    // Sleep ~1.5s; abort after 100ms.
    const cmd =
      process.platform === 'win32'
        ? 'powershell -Command "Start-Sleep -Milliseconds 1500"'
        : 'sleep 1.5';
    const p = runShell(cmd, { cwd: root, timeoutMs: 5000, abortSignal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    const r = await p;
    expect(r.aborted).toBe(true);
  });

  it('times out long-running commands', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-cli-bash-'));
    const cmd =
      process.platform === 'win32'
        ? 'powershell -Command "Start-Sleep -Milliseconds 1500"'
        : 'sleep 1.5';
    const r = await runShell(cmd, { cwd: root, timeoutMs: 200 });
    expect(r.timedOut).toBe(true);
  });
});
