#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');
const unityFixture = join(root, 'fixtures', 'unity-mini');
const cocosFixture = join(root, 'fixtures', 'cocos-3.8-mini');
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

check('unity unit tests', () => {
  const r = spawnSync(
    pnpm,
    [
      'exec',
      'vitest',
      'run',
      'src/engines/unity/detector.test.ts',
      'src/core/llm/extract-code.test.ts',
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('dotnet build unity-mini (if SDK present)', () => {
  const ver = spawnSync('dotnet', ['--version'], { encoding: 'utf8', shell: true });
  if (ver.status !== 0) {
    console.log('  (skip: dotnet SDK not installed)');
    return;
  }
  const r = spawnSync('dotnet', ['build', 'SparkCLI.sln', '--nologo', '-v', 'q'], {
    cwd: unityFixture,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'dotnet build failed');
});

check('validate unity-mini --json', () => {
  const r = run(['validate', '--json'], unityFixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  const unity = j.results.find((x) => x.name === 'unity_project');
  if (!unity?.ok) throw new Error(JSON.stringify(unity));
});

check('validate cocos fixture unchanged', () => {
  const r = run(['validate', '--json'], cocosFixture);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

check('staging apply (patch-manager)', () => {
  const r = spawnSync(
    pnpm,
    ['exec', 'vitest', 'run', 'src/core/staging/patch-manager.test.ts'],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
});

console.log(`\nPhase 6 accept: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
