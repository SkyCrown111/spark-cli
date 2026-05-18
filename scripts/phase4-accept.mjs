#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');
const fixture = join(root, 'fixtures', 'cocos-3.8-mini');

function run(args, cwd = fixture) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd });
}

let ok = 0;
let fail = 0;

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

check('phase4 unit tests', () => {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/engines/wechat/build-analyzer.test.ts',
      'src/core/validate/wechat-limits.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('build analyze --json', () => {
  const r = run(['build', 'analyze', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (!j.sizes?.mainBytes) throw new Error('missing sizes');
  if (!j.checks?.length) throw new Error('missing limit checks');
});

check('adapt wechat --json', () => {
  const r = run(['adapt', 'wechat', '--json']);
  const j = JSON.parse(r.stdout);
  if (!Array.isArray(j.issues)) throw new Error('missing issues');
});

check('asset list', () => {
  const r = run(['asset', 'list', '--json']);
  if (r.status !== 0) throw new Error(r.stderr);
  const j = JSON.parse(r.stdout);
  if (!j.assets?.length) throw new Error('expected assets');
});

check('build suggest-split', () => {
  const r = run(['build', 'suggest-split', '--json']);
  if (r.status !== 0) throw new Error(r.stderr);
  const j = JSON.parse(r.stdout);
  if (!j.suggestions?.length) throw new Error('expected suggestions');
});

console.log(`\nPhase 4 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
