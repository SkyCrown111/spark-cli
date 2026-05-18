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

check('knowledge index', () => {
  const r = run(['knowledge', 'index']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('knowledge search 微信', () => {
  const r = run(['knowledge', 'search', '微信', '分包', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (!j.hits?.length) throw new Error('expected knowledge hits');
});

check('memory add/show', () => {
  let r = run(['memory', 'add', 'naming', 'PascalCase for components']);
  if (r.status !== 0) throw new Error(r.stderr);
  r = run(['memory', 'show']);
  if (!r.stdout.includes('naming')) throw new Error('memory not stored');
});

check('scene optimize', () => {
  const r = run(['scene', 'optimize', 'assets/scenes/main.scene']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('validate scene_integrity', () => {
  const r = run(['validate', '--json']);
  const j = JSON.parse(r.stdout);
  const si = j.results.find((x) => x.name === 'scene_integrity');
  if (!si?.ok) throw new Error(JSON.stringify(si));
});

console.log(`\nPhase 2 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
