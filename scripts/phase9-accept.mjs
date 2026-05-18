#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');
const fixture = join(root, 'fixtures', 'cocos-3.8-mini');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

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

function run(args, cwd = fixture) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd });
}

check('level/anim unit tests', () => {
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/core/level/',
      'src/core/anim/',
      'src/core/editor/staging-sync.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('level new + apply on cocos fixture', () => {
  let r = run(['level', 'new', 'forest', '3条路径 Boss北侧', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (!j.jsonPath?.includes('forest')) throw new Error('bad json path');
  r = run(['apply', '-y']);
  if (r.status !== 0) throw new Error(r.stderr);
  if (!existsSync(join(fixture, j.jsonPath))) throw new Error('level json missing after apply');
});

check('anim new state machine + apply', () => {
  let r = run(['anim', 'new', 'Player', 'Idle->Run->Jump', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  r = run(['apply', '-y']);
  if (r.status !== 0) throw new Error(r.stderr);
  const raw = readFileSync(join(fixture, j.jsonPath), 'utf8');
  const g = JSON.parse(raw);
  if (!g.states?.some((s) => s.id === 'Jump')) throw new Error('missing Jump state');
});

check('anim export runtime bundle', () => {
  const path = 'assets/anim/player.controller.json';
  const r = run(['anim', 'export', path, '--json']);
  if (r.status !== 0) throw new Error(r.stderr);
});

check('editor static bundle + server unit test', () => {
  if (!existsSync(join(root, 'dist', 'editor', 'public', 'index.html'))) {
    throw new Error('editor static bundle missing');
  }
  const r = spawnSync(
    pnpm,
    ['exec', 'vitest', 'run', 'src/core/editor/server.test.ts'],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('validate tsc after level/anim', () => {
  const r = run(['validate', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

console.log(`\nPhase 9 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
