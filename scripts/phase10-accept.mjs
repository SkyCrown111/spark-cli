#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');
const godotFixture = join(root, 'fixtures', 'godot-mini');
const unrealFixture = join(root, 'fixtures', 'unreal-mini');
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

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd });
}

check('engine detector unit tests', () => {
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/engines/unreal/detector.test.ts',
      'src/engines/godot/detector.test.ts',
      'src/engines/godot/scene-parser.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('godot: gen → validate → build', () => {
  let r = run(['gen', 'top-down movement', '--json'], godotFixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  r = run(['apply', '-y'], godotFixture);
  if (r.status !== 0) throw new Error(r.stderr);
  r = run(['validate', '--json'], godotFixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const v = JSON.parse(r.stdout);
  if (!v.results.find((x) => x.name === 'godot_project')?.ok) throw new Error('godot validate');
  r = run(['build', 'godot', '--platform', 'web', '--json', '--dry-run'], godotFixture);
  if (r.status !== 0) throw new Error(r.stderr);
});

check('unreal: gen → validate → build', () => {
  let r = run(['gen', 'patrol actor', '--json'], unrealFixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  r = run(['apply', '-y'], unrealFixture);
  if (r.status !== 0) throw new Error(r.stderr);
  if (!existsSync(join(unrealFixture, 'Source/SparkCLI/SparkCLI_GeneratedActor.h'))) {
    throw new Error('missing generated header');
  }
  r = run(['validate', '--json'], unrealFixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  r = run(['build', 'unreal', '--json', '--dry-run'], unrealFixture);
  if (r.status !== 0) throw new Error(r.stderr);
});

check('init --engine godot', () => {
  const r = run(['init', '--engine', 'godot', '--json'], godotFixture);
  if (r.status !== 0) throw new Error(r.stderr);
});

check('MCP godot tscn_list', () => {
  const r = spawnSync(
    pnpm,
    ['exec', 'vitest', 'run', 'src/mcp/tools.engine.test.ts'],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

console.log(`\nPhase 10 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
