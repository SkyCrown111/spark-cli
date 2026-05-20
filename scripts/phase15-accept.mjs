// Phase 15 acceptance: CLI UI/UX modernization with Ink/React.
//
// Validates the new component system, hooks, theme system, and Ink REPL
// integration alongside existing baseline quality gates.
//
// Run with: pnpm test:phase15

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const fail = [];
const warn = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ phase15: ${label}`);
  else {
    console.error(`✗ phase15: ${label}${detail ? ' — ' + detail : ''}`);
    fail.push(label);
  }
}
function note(label, detail = '') {
  console.log(`  phase15: ${label}${detail ? ' — ' + detail : ''}`);
  warn.push(label);
}

// 1) Baseline quality gates: typecheck + tests + build
console.log('\n--- Phase 15 Baseline ---');
const steps = [
  ['typecheck', ['exec', 'tsc', '--noEmit']],
  ['unit tests', ['test']],
  ['build', ['run', 'build']],
];
for (const [label, args] of steps) {
  const r = spawnSync('pnpm', args, { stdio: 'inherit', shell: true });
  check(label, r.status === 0);
}

// 2) Source files existence checks
console.log('\n--- Phase 15 Component Files ---');
const requiredFiles = [
  // Design system
  'src/components/design-system/Box.tsx',
  'src/components/design-system/Text.tsx',
  'src/components/design-system/Spinner.tsx',
  'src/components/design-system/ProgressIndicator.tsx',
  // Messages
  'src/components/messages/Messages.tsx',
  'src/components/messages/UserMessage.tsx',
  'src/components/messages/AssistantMessage.tsx',
  'src/components/messages/ToolMessage.tsx',
  'src/components/messages/MarkdownRenderer.tsx',
  'src/components/messages/ErrorMessage.tsx',
  // PromptInput
  'src/components/PromptInput/PromptInput.tsx',
  // StatusBar
  'src/components/StatusBar/StatusBar.tsx',
  'src/components/StatusBar/ModeIndicator.tsx',
  'src/components/StatusBar/TokenCounter.tsx',
  'src/components/StatusBar/KeybindingHints.tsx',
  // Hooks
  'src/hooks/useTerminalSize.ts',
  'src/hooks/useKeybindings.ts',
  'src/hooks/useMessages.ts',
  'src/hooks/useInputHistory.ts',
  'src/hooks/index.ts',
  // Screens
  'src/screens/REPL.tsx',
  // Theme
  'src/theme/colors.ts',
  'src/theme/theme.ts',
  'src/theme/index.ts',
  // Ink REPL bridge
  'src/core/repl/ink-repl.tsx',
  // Tasks doc
  '.kiro/specs/cli-improvement-plan/tasks.md',
];
for (const f of requiredFiles) {
  check(`file: ${f}`, existsSync(f));
}

// 3) Test file existence checks
console.log('\n--- Phase 15 Test Coverage ---');
const requiredTests = [
  'src/components/design-system/Box.test.tsx',
  'src/components/design-system/Text.test.tsx',
  'src/components/design-system/Spinner.test.tsx',
  'src/components/messages/Messages.test.tsx',
  'src/components/messages/UserMessage.test.tsx',
  'src/components/messages/AssistantMessage.test.tsx',
  'src/components/messages/ToolMessage.test.tsx',
  'src/components/PromptInput/PromptInput.test.tsx',
  'src/components/StatusBar/StatusBar.test.tsx',
  'src/components/StatusBar/ModeIndicator.test.tsx',
  'src/components/StatusBar/TokenCounter.test.tsx',
  'src/hooks/useTerminalSize.test.tsx',
  'src/hooks/useKeybindings.test.tsx',
  'src/hooks/useMessages.test.tsx',
  'src/hooks/useInputHistory.test.tsx',
  'src/screens/REPL.test.tsx',
  'src/theme/colors.test.ts',
  'src/theme/theme.test.ts',
];
for (const f of requiredTests) {
  check(`test: ${f}`, existsSync(f));
}

// 4) Verify --ink flag is registered on shell/chat commands
console.log('\n--- Phase 15 CLI Integration ---');
try {
  const cliSrc = readFileSync('src/cli.ts', 'utf8');
  check('cli.ts registers --ink on chat command', cliSrc.includes("chat [prompt...]") && cliSrc.includes("--ink"));
  check('cli.ts registers --ink on shell command', cliSrc.includes("shell', { isDefault: true }") && cliSrc.includes("ink?: boolean"));
} catch (e) {
  check('cli.ts read', false, e.message);
}

// 5) Verify shell.ts delegates to Ink REPL when --ink is set
try {
  const shellSrc = readFileSync('src/commands/shell.ts', 'utf8');
  check('shell.ts has ink option in RunShellOptions', shellSrc.includes('ink?: boolean'));
  check('shell.ts delegates to runInkRepl', shellSrc.includes('runInkRepl'));
  check('shell.ts lazy-imports ink-repl', shellSrc.includes("import('../core/repl/ink-repl.js')"));
} catch (e) {
  check('shell.ts read', false, e.message);
}

// 6) Verify theme system
try {
  const themeSrc = readFileSync('src/theme/theme.ts', 'utf8');
  check('theme.ts exports darkTheme', themeSrc.includes('darkTheme'));
  check('theme.ts exports lightTheme', themeSrc.includes('lightTheme'));
  check('theme.ts has setTheme', themeSrc.includes('function setTheme'));
  check('theme.ts has createCustomTheme', themeSrc.includes('function createCustomTheme'));
} catch (e) {
  check('theme.ts read', false, e.message);
}

// 7) Test counts
console.log('\n--- Phase 15 Test Counts ---');
const testCountR = spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter', 'json'], { encoding: 'utf8', shell: true });
if (testCountR.status === 0) {
  try {
    const jsonStart = testCountR.stdout.lastIndexOf('{');
    if (jsonStart >= 0) {
      const json = JSON.parse(testCountR.stdout.slice(jsonStart));
      const totalTests = json.numTotalTests || 0;
      const totalPassed = json.numPassedTests || 0;
      check(`total tests ≥ 580`, totalTests >= 580, `got ${totalTests}`);
      check(`all tests passing (${totalPassed}/${totalTests})`, totalPassed === totalTests);
    } else {
      note('could not parse test JSON output');
    }
  } catch {
    // fallback: just check exit code
    note('test count parse failed, but tests passed');
  }
} else {
  check('test run', false);
}

// 8) Summary
console.log('\n--- Phase 15 Summary ---');
if (fail.length === 0) {
  console.log('✓ Phase 15 acceptance: PASS');
  process.exit(0);
} else {
  console.error(`✗ Phase 15 acceptance: FAIL (${fail.length} checks failed)`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}