#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

check('replay/plugin unit tests', () => {
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/core/replay/export.test.ts',
      'src/core/plugin/manager.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('replay export CLI', () => {
  run(['validate', '--json']);
  const r = run(['replay', 'export', '.spark-cli/replay-cli-test.json', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('plugin install list', () => {
  const pluginSrc = join(root, 'plugins', 'hello-spark-cli');
  let r = run(['plugin', 'install', pluginSrc]);
  if (r.status !== 0) throw new Error(r.stderr);
  r = run(['plugin', 'list', '--json']);
  const j = JSON.parse(r.stdout);
  if (!j.plugins?.some((p) => p.name === 'hello-spark-cli')) throw new Error('plugin missing');
  r = run(['plugin', 'uninstall', 'hello-spark-cli']);
  if (r.status !== 0) throw new Error(r.stderr);
});

check('docs present', () => {
  for (const f of [
    'docs/COMMANDS.md',
    'docs/ACCEPTANCE-PHASE1-4.md',
    'docs/PUBLISHING.md',
    'CONTRIBUTING.md',
  ]) {
    if (!existsSync(join(root, f))) throw new Error(`missing ${f}`);
  }
});

check('phase 1-4 regression scripts', () => {
  for (const script of ['test:phase1', 'test:phase2', 'test:phase4']) {
    const r = spawnSync(pnpm, ['run', script], { cwd: root, encoding: 'utf8', shell: true });
    if (r.status !== 0) throw new Error(`${script} failed`);
  }
});

console.log(`\nPhase 8 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
