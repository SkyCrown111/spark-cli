#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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

check('vision unit tests', () => {
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/core/vision/',
      'src/core/llm/vision-messages.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('ui --sketch dry-run builds messages', () => {
  const sketch = join(root, 'fixtures/ui-input/login-screen.sketch.json');
  const r = run(['ui', '--sketch', sketch, 'login UI', '--dry-run', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (!j.dryRun) throw new Error('expected dryRun');
});

check('ui rejects multiple visual inputs', () => {
  const r = run(['ui', '--image', 'a.png', '--sketch', 'b.json']);
  if (r.status === 0) throw new Error('expected failure');
});

console.log(`\nPhase 7 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
