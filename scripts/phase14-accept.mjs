// Phase 14 acceptance: game-dev depth.
//
// This script grows alongside the 15 deliverables in docs/PHASE-14.md. While
// items are still in ⏳, the script enforces the Phase 14 *baseline* (typecheck
// + tests + build still green, the doc exists, version is bumped, parity tools
// count never regresses below Phase 13). As items flip to ✅, per-item checks
// below should be uncommented (look for `// [item N]` markers).
//
// Run with: pnpm test:phase14

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const fail = [];
const warn = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ phase14: ${label}`);
  else {
    console.error(`✗ phase14: ${label}${detail ? ' — ' + detail : ''}`);
    fail.push(label);
  }
}
function note(label, detail = '') {
  console.log(`  phase14: ${label}${detail ? ' — ' + detail : ''}`);
  warn.push(label);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });
}

// 1) typecheck + unit tests + build (same baseline as Phase 13)
const steps = [
  ['typecheck', ['exec', 'tsc', '--noEmit']],
  ['unit tests', ['test']],
  ['build', ['run', 'build']],
];
for (const [label, args] of steps) {
  const r = spawnSync('pnpm', args, { stdio: 'inherit', shell: true });
  check(label, r.status === 0);
}

// 2) Phase 14 doc + version bump
check('docs/PHASE-14.md exists', existsSync('docs/PHASE-14.md'));
check('CHANGELOG.md exists', existsSync('CHANGELOG.md'));
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  check('version is 0.3.x (incl. -dev)', /^0\.3\./.test(pkg.version), `got ${pkg.version}`);
  check(
    'package.json declares test:phase14',
    typeof pkg.scripts?.['test:phase14'] === 'string',
  );
} catch (e) {
  check('package.json readable', false, e.message);
}

// 3) Phase 14 status table progress (informational; not gated)
//    Counts ✅ vs ⏳ rows in the Status table so progress is visible in CI.
try {
  const doc = readFileSync('docs/PHASE-14.md', 'utf8');
  const tableLines = doc
    .split('\n')
    .filter((l) => /^\| +\d+ +\|/.test(l));
  const done = tableLines.filter((l) => l.includes('✅')).length;
  const pending = tableLines.filter((l) => l.includes('⏳')).length;
  const total = done + pending;
  check('PHASE-14 status table parses', total === 15, `parsed ${total} rows, expected 15`);
  note(`progress: ${done}/${total} delivered`);
} catch (e) {
  check('PHASE-14.md parseable', false, e.message);
}

// 4) Tool registry baseline — Phase 14 must NOT shrink the Phase 13 surface.
const phase13Tools = [
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
for (const name of phase13Tools) {
  const parts = name.split('_');
  const camel = parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
  check(
    `phase13 tool still registered: ${name}`,
    indexSrc.includes('reg.register(' + camel + 'Tool)'),
  );
}

// 5) Per-item Phase 14 deliverable checks.
//    Each block is gated by `existsSync` on the file the item is supposed to
//    deliver — so the check only fires once that item lands. Flip the comment
//    on the corresponding `Status` row in PHASE-14.md to ✅ at the same time.

// [item 1] Unity scene-graph writer 深化
if (existsSync('src/engines/unity/scene-writer-nested.ts')) {
  check('item 1: unity nested writer present', true);
} else {
  note('item 1 pending: src/engines/unity/scene-writer-nested.ts');
}

// [item 2] Cocos 场景写入扩展
if (existsSync('src/engines/cocos/scene-writer-extras.ts')) {
  check('item 2: cocos scene extras present', true);
} else {
  note('item 2 pending: src/engines/cocos/scene-writer-extras.ts');
}

// [item 3] Godot tscn writer
if (existsSync('src/engines/godot/scene-writer.ts')) {
  check('item 3: godot scene writer present', true);
} else {
  note('item 3 pending: src/engines/godot/scene-writer.ts');
}

// [item 4] Unreal AST
if (existsSync('src/engines/unreal/uproject-graph.ts')) {
  check('item 4: unreal uproject graph present', true);
} else {
  note('item 4 pending: src/engines/unreal/uproject-graph.ts');
}

// [item 5] assets audit / fix
if (existsSync('src/core/assets/audit.ts')) {
  check('item 5: assets audit present', true);
} else {
  note('item 5 pending: src/core/assets/audit.ts');
}

// [item 6] perf lint + platform matrix
if (
  existsSync('src/core/validate/perf-lint.ts') &&
  existsSync('src/core/validate/platform-matrix.ts')
) {
  check('item 6: perf-lint + platform-matrix present', true);
} else {
  note('item 6 pending: src/core/validate/{perf-lint,platform-matrix}.ts');
}

// [item 7] shader workflow
if (
  existsSync('src/core/shader/lint.ts') &&
  existsSync('src/core/shader/translate.ts')
) {
  check('item 7: shader lint+translate present', true);
} else {
  note('item 7 pending: src/core/shader/{lint,translate}.ts');
}

// [item 8] profile capture/analyze/budget
if (
  existsSync('src/core/profile/capture.ts') &&
  existsSync('src/core/profile/analyze.ts') &&
  existsSync('src/core/profile/budget.ts')
) {
  check('item 8: profile capture+analyze+budget present', true);
} else {
  note('item 8 pending: src/core/profile/{capture,analyze,budget}.ts');
}

// [item 9] art atlas + spine/dragonbones/lottie
if (existsSync('src/core/art/atlas.ts')) {
  check('item 9: art atlas present', true);
} else {
  note('item 9 pending: src/core/art/atlas.ts');
}

// [item 10] gameplay tilemap/balance/difficulty
if (
  existsSync('src/core/gameplay/tilemap.ts') &&
  existsSync('src/core/gameplay/balance.ts')
) {
  check('item 10: gameplay tilemap+balance present', true);
} else {
  note('item 10 pending: src/core/gameplay/{tilemap,balance}.ts');
}

// [item 11] playtest protocol/runner
if (
  existsSync('src/core/playtest/protocol.ts') &&
  existsSync('src/core/playtest/runner.ts')
) {
  check('item 11: playtest protocol+runner present', true);
} else {
  note('item 11 pending: src/core/playtest/{protocol,runner}.ts');
}

// [item 12] multi-agent farm + staging locks
if (
  existsSync('src/core/staging/locks.ts') &&
  /agent[\s\S]*\.command\('farm|farm_run/.test(readFileSync('src/cli.ts', 'utf8'))
) {
  check('item 12: staging locks + farm command present', true);
} else {
  note('item 12 pending: src/core/staging/locks.ts + cli farm command');
}

// [item 13] editor bridge expansion
if (
  existsSync('packages/unity/com.spark-cli.bridge') &&
  existsSync('packages/unreal') // first-time creation
) {
  check('item 13: unity+unreal bridge packages present', true);
} else {
  note('item 13 pending: packages/{unity,unreal}/* bridges');
}

// [item 14] reverse MCP
if (existsSync('src/mcp/engine-tools.ts')) {
  check('item 14: mcp engine-tools present', true);
} else {
  note('item 14 pending: src/mcp/engine-tools.ts');
}

// [item 15] image/audio gen providers
if (
  existsSync('src/core/providers/image-gen.ts') &&
  existsSync('src/core/providers/audio-gen.ts')
) {
  check('item 15: image+audio gen providers present', true);
} else {
  note('item 15 pending: src/core/providers/{image-gen,audio-gen}.ts');
}

// 6) Doctor parity tools count — must be ≥ Phase 13 baseline.
//    Phase 13 acceptance only asserted "is a number". Phase 14 freezes the
//    baseline at the current count and forbids regressions.
const PHASE13_TOOL_BASELINE = 25; // Phase 13 surface size
if (existsSync('dist/cli.js')) {
  const r = run(process.execPath, ['dist/cli.js', 'doctor', '--json', '--project', '.']);
  let count = -1;
  try {
    const out = JSON.parse(r.stdout);
    count = out?.parity?.tools?.count ?? -1;
  } catch {
    count = -1;
  }
  check(
    `doctor parity.tools.count >= ${PHASE13_TOOL_BASELINE}`,
    count >= PHASE13_TOOL_BASELINE,
    `got ${count}`,
  );
  note(`current parity.tools.count: ${count}`);
} else {
  check('dist/cli.js exists', false, 'build step did not produce dist/cli.js');
}

if (fail.length > 0) {
  console.error(`\nPhase 14 baseline failed: ${fail.length} check(s) failed.`);
  process.exit(1);
}
console.log(
  `\nPhase 14: baseline green (${warn.length} pending item${warn.length === 1 ? '' : 's'}).`,
);
process.exit(0);
