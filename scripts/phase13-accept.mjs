// Phase 13 acceptance: functional alignment with Claude Code.
//
// Verifies that the Phase 13 surface is wired up — every new tool name shows
// up in the agent registry, the new commands exist on the CLI, the parity
// block is present in `spark-cli doctor --json`, and the build pipeline still
// passes typecheck + unit tests + bundle.
//
// Run with: pnpm test:phase13

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const fail = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ phase13: ${label}`);
  else {
    console.error(`✗ phase13: ${label}${detail ? ' — ' + detail : ''}`);
    fail.push(label);
  }
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });
}

// 1) typecheck + unit tests + build
const steps = [
  ['typecheck', ['exec', 'tsc', '--noEmit']],
  ['unit tests', ['test']],
  ['build', ['run', 'build']],
];
for (const [label, args] of steps) {
  const r = spawnSync('pnpm', args, { stdio: 'inherit', shell: true });
  check(label, r.status === 0);
}

// 2) Phase doc + changelog presence
check('docs/PHASE-13.md exists', existsSync('docs/PHASE-13.md'));
check('CHANGELOG.md exists', existsSync('CHANGELOG.md'));

// 3) package.json version >= 0.2.0
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  check('version is 0.2.x', /^0\.2\./.test(pkg.version), `got ${pkg.version}`);
} catch (e) {
  check('package.json readable', false, e.message);
}

// 4) Tool registry contains the new names
const toolNames = [
  'ask_user_question',
  'bash_background',
  'task_output',
  'task_stop',
  'web_fetch',
  'web_search',
  'todo_create',
  'todo_list',
  'todo_get',
  'todo_update',
  'memory_save',
  'memory_search',
  'memory_list',
  'memory_delete',
];
const indexSrc = readFileSync('src/core/agent/tools/index.ts', 'utf8');
for (const name of toolNames) {
  // Tool files set name: 'foo'; the registry imports them — registration is enough.
  // Identifier convention is camelCase: ask_user_question → askUserQuestionTool.
  const parts = name.split('_');
  const camel = parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
  const importedToken = camel + 'Tool';
  check(
    `tool registered: ${name}`,
    indexSrc.includes('reg.register(' + importedToken + ')'),
    `expected reg.register(${importedToken}) in tools/index.ts`,
  );
}

// 5) CLI subcommands wired up
const cliSrc = readFileSync('src/cli.ts', 'utf8');
for (const phrase of [
  "program.command('worktree')",
  "program.command('cron')",
]) {
  check(`cli registers: ${phrase}`, cliSrc.includes(phrase));
}

// 6) Unity scene-graph MCP writer files present
for (const path of [
  'src/engines/unity/scene-graph.ts',
  'src/engines/unity/scene-writer.ts',
  'src/engines/unity/scene-list.ts',
]) {
  check(`unity writer: ${path}`, existsSync(path));
}

// 7) Doctor parity block — invoke the built CLI in JSON mode against this repo.
//    `spark-cli doctor` is read-only and the repo is not an engine project, but
//    the parity block should still render.
if (existsSync('dist/cli.js')) {
  const r = run(process.execPath, ['dist/cli.js', 'doctor', '--json', '--project', '.']);
  let parityOk = false;
  try {
    const out = JSON.parse(r.stdout);
    parityOk = out && out.parity && typeof out.parity.tools?.count === 'number';
  } catch {
    parityOk = false;
  }
  check('doctor --json includes parity block', parityOk, r.stderr?.slice(0, 200));
} else {
  check('dist/cli.js exists', false, 'build step did not produce dist/cli.js');
}

if (fail.length > 0) {
  console.error(`\nPhase 13 failed: ${fail.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nPhase 13: all checks passed.');
process.exit(0);
