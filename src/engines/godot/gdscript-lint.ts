/**
 * Phase 14 #3 — Lightweight GDScript static check.
 *
 * No dependency on a real Godot toolchain. We grep for a small set of
 * high-signal mistakes that an agent's edits are likely to introduce. Output
 * is the same `{ rule, severity, line, message }` shape used elsewhere so the
 * `validate` and `assets audit` consumers can share renderers.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type GdLintSeverity = 'error' | 'warn' | 'hint';

export interface GdLintIssue {
  rule: string;
  severity: GdLintSeverity;
  line: number;
  message: string;
}

interface RuleContext {
  lines: string[];
  text: string;
}

interface Rule {
  id: string;
  severity: GdLintSeverity;
  check(ctx: RuleContext): GdLintIssue[];
}

const KNOWN_LIFECYCLE = new Set([
  '_ready',
  '_init',
  '_process',
  '_physics_process',
  '_input',
  '_unhandled_input',
  '_unhandled_key_input',
  '_enter_tree',
  '_exit_tree',
  '_notification',
  '_draw',
]);

/** Catch typos like `func _read():` — close to but not exactly a lifecycle name. */
const lifecycleTypoRule: Rule = {
  id: 'lifecycle-typo',
  severity: 'warn',
  check({ lines }) {
    const out: GdLintIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const m = /^\s*func\s+(_[A-Za-z_]+)\s*\(/.exec(line);
      if (!m) continue;
      const name = m[1]!;
      if (KNOWN_LIFECYCLE.has(name)) continue;
      // Trigger only if it's "close" to a known one.
      for (const known of KNOWN_LIFECYCLE) {
        if (levenshtein(name, known) === 1) {
          out.push({
            rule: 'lifecycle-typo',
            severity: 'warn',
            line: i + 1,
            message: `function "${name}" looks like a typo of "${known}"`,
          });
          break;
        }
      }
    }
    return out;
  },
};

/** `@onready` may only annotate variable assignments. */
const onreadyMisuseRule: Rule = {
  id: 'onready-misuse',
  severity: 'warn',
  check({ lines }) {
    const out: GdLintIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!/^\s*@onready\b/.test(line)) continue;
      // Allow trailing comment or `var X = ...` on the same line.
      if (/^\s*@onready\s+var\s+/.test(line)) continue;
      // Otherwise next non-empty line should be `var ... = ...`.
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? '').trim() === '') j++;
      if (!/^\s*var\s+/.test(lines[j] ?? '')) {
        out.push({
          rule: 'onready-misuse',
          severity: 'warn',
          line: i + 1,
          message: '@onready must annotate a `var` declaration',
        });
      }
    }
    return out;
  },
};

/** `await something` outside an async-capable function (any `func` is fine in Godot 4 — flag bare top-level awaits). */
const strayAwaitRule: Rule = {
  id: 'stray-await',
  severity: 'warn',
  check({ lines }) {
    const out: GdLintIssue[] = [];
    let depth = 0;
    let inFunc = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (/^\s*func\s+/.test(line)) {
        inFunc = true;
        depth = 0;
      } else if (inFunc) {
        const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
        if (line.trim() === '') {
          // skip blanks
        } else if (indent === 0 && !/^\s*func\s+/.test(line)) {
          inFunc = false;
        }
      }
      if (/^\s*await\s+/.test(line) && !inFunc) {
        out.push({
          rule: 'stray-await',
          severity: 'warn',
          line: i + 1,
          message: 'await found outside any func (top-level awaits are not legal in GDScript)',
        });
      }
      depth++;
    }
    return out;
  },
};

/** Connecting in `_ready` without a matching `disconnect` somewhere is suspicious for non-singleton scripts. */
const danglingSignalRule: Rule = {
  id: 'dangling-signal',
  severity: 'hint',
  check({ text, lines }) {
    const out: GdLintIssue[] = [];
    const connectRe = /\.connect\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g;
    const seen = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = connectRe.exec(text)) !== null) {
      const name = m[1]!;
      if (!seen.has(name)) {
        // record first occurrence's line
        const upToHere = text.slice(0, m.index).split(/\r?\n/).length;
        seen.set(name, upToHere);
      }
    }
    if (seen.size === 0) return out;
    const hasDisconnect = /\.disconnect\(/.test(text);
    if (!hasDisconnect) {
      for (const [name, line] of seen) {
        out.push({
          rule: 'dangling-signal',
          severity: 'hint',
          line,
          message: `signal "${name}" is connected but no disconnect() found in this file`,
        });
      }
    }
    void lines; // silence
    return out;
  },
};

const RULES: Rule[] = [lifecycleTypoRule, onreadyMisuseRule, strayAwaitRule, danglingSignalRule];

export interface GdLintResult {
  file: string;
  issues: GdLintIssue[];
}

export function lintGdScriptText(text: string): GdLintIssue[] {
  const lines = text.split(/\r?\n/);
  const ctx: RuleContext = { lines, text };
  const out: GdLintIssue[] = [];
  for (const rule of RULES) out.push(...rule.check(ctx));
  out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return out;
}

export function lintGdScriptFile(projectRoot: string, rel: string): GdLintResult {
  const full = join(projectRoot, rel);
  const text = readFileSync(full, 'utf8');
  return { file: rel.replace(/\\/g, '/'), issues: lintGdScriptText(text) };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]!;
  }
  return prev[n]!;
}
