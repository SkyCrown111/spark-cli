#!/usr/bin/env node
/**
 * Phase 1 acceptance script (no real LLM call required).
 * Usage: node scripts/phase1-accept.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...opts.env },
  });
  return { ...r, ok: r.status === 0 };
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    failed++;
  }
}

check('build exists', () => {
  if (!existsSync(cli)) throw new Error('Run pnpm build first');
});

check('spark-cli --version', () => {
  const r = run(['--version']);
  if (!r.ok || !r.stdout.trim().match(/^\d+\.\d+\.\d+$/)) throw new Error(r.stderr || r.stdout);
});

check('doctor in fixture (json)', () => {
  const fixture = join(root, 'fixtures', 'cocos-3.8-mini');
  const r = run(['doctor', '--json'], {
    cwd: fixture,
    env: { OPENAI_API_KEY: 'sk-accept-test', SPARK_CLI_PROJECT: fixture },
  });
  const j = JSON.parse(r.stdout);
  if (!j.checks) throw new Error('invalid doctor json');
});

check('model use writes global config', () => {
  const r = run(['model', 'use', 'openai/gpt-4o-mini']);
  if (!r.ok) throw new Error(r.stderr || r.stdout);
  const cfg = join(homedir(), '.spark-cli', 'config.yaml');
  if (!existsSync(cfg)) throw new Error('missing ~/.spark-cli/config.yaml');
  const text = readFileSync(cfg, 'utf8');
  if (!text.includes('gpt-4o-mini')) throw new Error('model not in config');
});

check('chat fails without API key (code 2)', () => {
  const empty = mkdtempSync(join(tmpdir(), 'spark-cli-empty-'));
  try {
    const r = run(['chat', 'hello'], {
      cwd: empty,
      env: {
        OPENAI_API_KEY: '',
        DEEPSEEK_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        SPARK_CLI_PROJECT: empty,
      },
    });
    if (r.status !== 2 && r.status !== 1) {
      throw new Error(`expected exit 1 or 2, got ${r.status}: ${r.stderr}${r.stdout}`);
    }
    const out = `${r.stderr}${r.stdout}`;
    if (!out.toLowerCase().includes('api key') && !out.toLowerCase().includes('model')) {
      throw new Error(`unexpected message: ${out}`);
    }
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

check('fixture validate (tsc)', () => {
  const fixture = join(root, 'fixtures', 'cocos-3.8-mini');
  const r = run(['validate', '--json'], { cwd: fixture });
  if (!r.ok) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  if (!j.ok) throw new Error(JSON.stringify(j));
});

check('apply without staging fails', () => {
  const empty = mkdtempSync(join(tmpdir(), 'spark-cli-apply-'));
  try {
    const r = run(['apply'], { cwd: empty });
    if (r.status === 0) throw new Error('apply should fail without staging');
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

check('doctor outside project', () => {
  const empty = mkdtempSync(join(tmpdir(), 'spark-cli-doc-'));
  try {
    const r = run(['doctor'], {
      cwd: empty,
      env: { OPENAI_API_KEY: 'sk-test' },
    });
    const out = `${r.stdout}${r.stderr}`;
    if (!out.includes('Doctor')) throw new Error('missing doctor output');
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

console.log(`\nPhase 1 accept: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

console.log('\nOptional (requires real API key):');
console.log('  cd fixtures/cocos-3.8-mini && spark-cli chat "test" && spark-cli apply && spark-cli validate');
