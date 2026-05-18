#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');
const fixture = join(root, 'fixtures', 'cocos-3.8-mini');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const cloudPort = 17401;

let ok = 0;
let fail = 0;
let mockProc;

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    ok++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    fail++;
  }
}

function run(args, cwd = root, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...env },
  });
}

function startMock() {
  mockProc = spawn(process.execPath, [cli, 'cloud', 'serve', '-p', String(cloudPort)], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, SPARK_CLI_CLOUD_AUTO_APPROVE: '1' },
  });
  for (let i = 0; i < 20; i++) {
    try {
      const r = spawnSync('node', ['-e', `fetch('http://127.0.0.1:${cloudPort}/health').then(r=>process.exit(r.ok?0:1))`], {
        encoding: 'utf8',
      });
      if (r.status === 0) return;
    } catch {
      /* wait */
    }
    spawnSync('node', ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250)']);
  }
  throw new Error('mock cloud server did not start');
}

function stopMock() {
  if (mockProc) mockProc.kill();
}

const sessionPath = join(homedir(), '.spark-cli', 'cloud', 'session.json');

check('cloud unit tests', () => {
  const r = spawnSync(
    pnpm,
    ['exec', 'vitest', 'run', 'src/cloud/session.test.ts', 'src/cloud/mock-server.test.ts'],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('cloud login + keys use + model test (proxy)', () => {
  startMock();
  if (existsSync(sessionPath)) rmSync(sessionPath, { force: true });

  const endpoint = `http://127.0.0.1:${cloudPort}`;
  let r = run(['cloud', 'login', '--yes', '--json'], root, {
    SPARK_CLI_CLOUD_ENDPOINT: endpoint,
    SPARK_CLI_CLOUD_AUTO_APPROVE: '1',
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);

  r = run(['cloud', 'keys', 'set', 'openai', '--key', 'sk-mock-test-key'], root, {
    SPARK_CLI_CLOUD_ENDPOINT: endpoint,
  });
  if (r.status !== 0) throw new Error(r.stderr);

  r = run(['cloud', 'keys', 'use', '--json'], root, { SPARK_CLI_CLOUD_ENDPOINT: endpoint });
  if (r.status !== 0) throw new Error(r.stderr);

  r = run(['model', 'use', 'openai/gpt-4o-mini'], root);
  if (r.status !== 0) throw new Error(r.stderr);

  r = run(['model', 'test'], root, { SPARK_CLI_CLOUD_ENDPOINT: endpoint });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);

  r = run(['cloud', 'logout'], root);
  if (r.status !== 0) throw new Error(r.stderr);
});

check('local mode without cloud login', () => {
  const r = run(['validate', '--json'], fixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('cloud push pull', () => {
  startMock();
  const endpoint = `http://127.0.0.1:${cloudPort}`;
  let r = run(['cloud', 'login', '--yes'], root, { SPARK_CLI_CLOUD_ENDPOINT: endpoint });
  if (r.status !== 0) throw new Error(r.stderr);
  r = run(['cloud', 'push', '--json'], fixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  r = run(['cloud', 'pull', '--dry-run', '--json'], fixture);
  if (r.status !== 0) throw new Error(r.stderr);
  run(['cloud', 'logout'], root);
});

stopMock();

console.log(`\nPhase 11 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
