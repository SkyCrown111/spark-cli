#!/usr/bin/env node
/**
 * Check that docs/COMMANDS.md lists every top-level CLI subcommand.
 *
 * Exit 0 when in sync; exit 1 with a diff when not.
 *
 * Usage:
 *   node scripts/check-commands.mjs          # human-readable
 *   node scripts/check-commands.mjs --json    # machine-readable
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 1. Extract top-level commands from register.ts ────────────────────

const registerPath = resolve(ROOT, 'src/commands/register.ts');
const registerSrc = readFileSync(registerPath, 'utf8');

// Top-level commands are registered via program.command('name') or program.command('name [args]')
// Handle various formats: 'chat [prompt...]', 'shell', 'gen [prompt...]', etc.
const topLevelPattern = /program\s*\.command\(\s*['"]([a-z][a-z0-9-]*)/g;
const registered = new Set();
let m;
while ((m = topLevelPattern.exec(registerSrc)) !== null) {
  registered.add(m[1]);
}

// ── 2. Extract commands from docs/COMMANDS.md ─────────────────────────

const docsPath = resolve(ROOT, 'docs/COMMANDS.md');
const docsSrc = readFileSync(docsPath, 'utf8');

// Extract all spark-cli command references
// Patterns to match:
// - `spark-cli <command>` in table cells
// - `spark-cli <command>` in prose
// - `spark-cli <command> <subcommand>` (extract parent command)
const documented = new Set();

// Match any spark-cli command reference
const allPatterns = [
  /`spark-cli\s+([a-z][a-z0-9-]*)`/g,
  /spark-cli\s+([a-z][a-z0-9-]*)/g,
];

for (const pattern of allPatterns) {
  let d;
  while ((d = pattern.exec(docsSrc)) !== null) {
    const cmd = d[1];
    // Skip generic words
    if (!['the', 'a', 'an', 'or', 'and', 'is', 'in', 'to', 'for', 'with', 'from'].includes(cmd)) {
      documented.add(cmd);
    }
  }
}

// ── 3. Compare ────────────────────────────────────────────────────────

const missingFromDocs = [...registered].filter((c) => !documented.has(c)).sort();
const extraInDocs = [...documented].filter((c) => !registered.has(c)).sort();

const jsonMode = process.argv.includes('--json');

if (missingFromDocs.length === 0 && extraInDocs.length === 0) {
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, registered: [...registered].sort() }));
  } else {
    console.log('OK docs/COMMANDS.md is in sync with registered top-level commands.');
  }
  process.exit(0);
}

if (jsonMode) {
  console.log(
    JSON.stringify(
      { ok: false, missingFromDocs, extraInDocs, registered: [...registered].sort() },
      null,
      2,
    ),
  );
} else {
  if (missingFromDocs.length > 0) {
    console.error('\nTop-level commands registered in code but NOT in docs/COMMANDS.md:');
    for (const c of missingFromDocs) console.error(`  - ${c}`);
  }
  if (extraInDocs.length > 0) {
    console.error('\nCommands in docs/COMMANDS.md but NOT registered in code:');
    for (const c of extraInDocs) console.error(`  - ${c}`);
  }
  console.error(
    `\nRun: node scripts/check-commands.mjs --json  for the full list of registered commands.`,
  );
}

process.exit(1);
