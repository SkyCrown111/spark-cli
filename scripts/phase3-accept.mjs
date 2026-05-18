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

check('phase3 unit tests', () => {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/mcp/tools.test.ts',
      'src/engines/cocos/scene-writer.test.ts',
      'src/bridge/client.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'vitest failed');
});

check('validate fixture', () => {
  const r = run(['validate', '--json']);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

console.log(`\nPhase 3 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
