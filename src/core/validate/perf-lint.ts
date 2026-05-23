/**
 * Lightweight performance / memory heuristics for game scripts (regex-based).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface PerfLintFinding {
  id: string;
  severity: 'warn' | 'error';
  path: string;
  line?: number;
  message: string;
}

const CODE_EXT = new Set(['.ts', '.js', '.tsx', '.jsx', '.gd']);

function walkCode(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'build' || name === 'dist') continue;
      walkCode(full, out);
    } else if (CODE_EXT.has(extname(name).toLowerCase())) {
      out.push(full);
    }
  }
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

export function lintPerfInFile(relPath: string, source: string): PerfLintFinding[] {
  const findings: PerfLintFinding[] = [];

  const tickFns = /\b(update|onUpdate|tick|_process|_physics_process)\s*\([^)]*\)\s*\{/gi;
  let m: RegExpExecArray | null;
  while ((m = tickFns.exec(source)) !== null) {
    const brace = source.indexOf('{', m.index);
    if (brace < 0) continue;
    let depth = 1;
    let i = brace + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    const body = source.slice(brace + 1, i - 1);
    if (/\bnew\s+[A-Za-z_$]/.test(body)) {
      findings.push({
        id: 'tick-allocation',
        severity: 'warn',
        path: relPath,
        line: lineOf(source, m.index),
        message: `${m[1]}() allocates with \`new\` — pool or reuse objects`,
      });
    }
  }

  const intervals = [...source.matchAll(/\bsetInterval\s*\(/g)];
  const clears = [...source.matchAll(/\bclearInterval\s*\(/g)];
  if (intervals.length > clears.length) {
    findings.push({
      id: 'interval-leak',
      severity: 'warn',
      path: relPath,
      line: intervals[0] ? lineOf(source, intervals[0].index!) : undefined,
      message: `setInterval (${intervals.length}) without matching clearInterval (${clears.length})`,
    });
  }

  const onCalls = [...source.matchAll(/\.on\s*\(\s*['"`]/g)];
  const offCalls = [...source.matchAll(/\.off\s*\(\s*['"`]/g)];
  if (onCalls.length > offCalls.length + 1) {
    findings.push({
      id: 'listener-leak',
      severity: 'warn',
      path: relPath,
      line: onCalls[0] ? lineOf(source, onCalls[0].index!) : undefined,
      message: `.on() calls (${onCalls.length}) may lack matching .off() (${offCalls.length})`,
    });
  }

  if (/\bdestroy\s*\(/.test(source) && /\.on\s*\(/.test(source)) {
    const destroyIdx = source.search(/\bdestroy\s*\(/);
    const tail = source.slice(destroyIdx);
    if (tail.length > 80 && /\.on\s*\(/.test(tail) && !/\.off\s*\(/.test(tail.slice(0, 400))) {
      findings.push({
        id: 'destroy-listener',
        severity: 'warn',
        path: relPath,
        line: lineOf(source, destroyIdx),
        message: 'Listeners registered near destroy() without teardown — check closures',
      });
    }
  }

  return findings;
}

export function lintPerfInProject(
  projectRoot: string,
  opts: { dirs?: string[] } = {},
): PerfLintFinding[] {
  const dirs = opts.dirs ?? ['assets', 'src', 'scripts'];
  const files: string[] = [];
  for (const d of dirs) walkCode(join(projectRoot, d), files);

  const all: PerfLintFinding[] = [];
  for (const abs of files) {
    const rel = abs
      .replace(projectRoot, '')
      .replace(/^[/\\]/, '')
      .replace(/\\/g, '/');
    const src = readFileSync(abs, 'utf8');
    all.push(...lintPerfInFile(rel, src));
  }
  return all;
}
