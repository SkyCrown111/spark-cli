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

check('platform unit tests', () => {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const r = spawnSync(
    pnpm,
    ['exec', 'vitest', 'run', 'src/engines/platform/adapt.test.ts'],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('adapt wechat --json', () => {
  const r = run(['adapt', 'wechat', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (j.platform !== 'wechat') throw new Error('expected wechat platform');
});

check('adapt douyin --json', () => {
  const r = run(['adapt', 'douyin', '--json']);
  const j = JSON.parse(r.stdout);
  if (j.platform !== 'douyin') throw new Error('expected douyin');
  if (!j.buildFound) throw new Error('expected douyin build fixture');
});

check('adapt alipay --json', () => {
  const r = run(['adapt', 'alipay', '--json']);
  const j = JSON.parse(r.stdout);
  if (j.platform !== 'alipay') throw new Error('expected alipay');
});

check('publish douyin --dry-run', () => {
  const r = run(['publish', 'douyin', '--env', 'preview', '--dry-run', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (!j.command) throw new Error('expected command skeleton');
});

console.log(`\nPhase 5 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
