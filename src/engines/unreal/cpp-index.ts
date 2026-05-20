/**
 * Phase 14 #4 — Unreal C++ index (regex fallback).
 *
 * When `tree-sitter` + `tree-sitter-cpp` are installed, `cpp-index-ast.ts` parses
 * the file and results are merged with regex (AST preferred on name collisions).
 * Regex-only extraction pulls out:
 *   - UCLASS specifiers and their declared class name + base
 *   - GENERATED_BODY presence (mandatory inside UCLASS)
 *   - UFUNCTION specifiers and the next function declaration
 *   - UPROPERTY specifiers and the next field declaration
 *
 * The regex output is a coarse outline; downstream tools can layer ASTs on top
 * later without breaking the schema.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isTreeSitterCppAvailable, parseCppOutlineAst } from './cpp-index-ast.js';

export interface CppOutlineEntry {
  /** Project-relative path of the .h or .cpp file. */
  file: string;
  uclasses: CppUClass[];
  ufunctions: CppUFunction[];
  uproperties: CppUProperty[];
}

export interface CppUClass {
  name: string;
  base?: string;
  /** Specifiers inside UCLASS(...), e.g. ["BlueprintType", "Abstract"]. */
  specifiers: string[];
  line: number;
  hasGeneratedBody: boolean;
}

export interface CppUFunction {
  name: string;
  /** Specifiers inside UFUNCTION(...), e.g. ["BlueprintCallable"]. */
  specifiers: string[];
  line: number;
}

export interface CppUProperty {
  name: string;
  /** Specifiers inside UPROPERTY(...), e.g. ["EditAnywhere", "Category=\"X\""]. */
  specifiers: string[];
  line: number;
}

const CPP_EXTS = new Set(['.h', '.hpp', '.cpp', '.cc']);

export type CppIndexBackend = 'regex' | 'tree-sitter';

/** Reports whether tree-sitter-cpp parsing is available. */
export function getCppIndexBackend(): CppIndexBackend {
  return isTreeSitterCppAvailable() ? 'tree-sitter' : 'regex';
}

export function indexUnrealCppDir(projectRoot: string, dir = 'Source'): CppOutlineEntry[] {
  const root = join(projectRoot, dir);
  const files: string[] = [];
  walk(root, files);
  return files.map((full) => parseCppFile(projectRoot, full));
}

export function parseCppFile(projectRoot: string, full: string): CppOutlineEntry {
  const text = readFileSync(full, 'utf8');
  const rel = relative(projectRoot, full).replace(/\\/g, '/');
  const regex = {
    uclasses: extractUClasses(text),
    ufunctions: extractUFunctions(text),
    uproperties: extractUProperties(text),
  };
  const ast = isTreeSitterCppAvailable() ? parseCppOutlineAst(text) : null;
  if (!ast) {
    return { file: rel, ...regex };
  }
  return {
    file: rel,
    uclasses: mergeByName(ast.uclasses, regex.uclasses),
    ufunctions: mergeByName(ast.ufunctions, regex.ufunctions),
    uproperties: mergeByName(ast.uproperties, regex.uproperties),
  };
}

function mergeByName<T extends { name: string }>(primary: T[], fallback: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of fallback) map.set(item.name, item);
  for (const item of primary) map.set(item.name, item);
  return [...map.values()];
}

export function findUClass(entries: CppOutlineEntry[], name: string): CppUClass | undefined {
  for (const e of entries) {
    const hit = e.uclasses.find((u) => u.name === name);
    if (hit) return hit;
  }
  return undefined;
}

export function listUFunctions(entries: CppOutlineEntry[], className: string): CppUFunction[] {
  // Coarse heuristic: returns UFUNCTIONs from files that declare the class.
  const out: CppUFunction[] = [];
  for (const e of entries) {
    if (e.uclasses.some((u) => u.name === className)) out.push(...e.ufunctions);
  }
  return out;
}

// ---------- helpers --------------------------------------------------------

function walk(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else {
      const dot = full.lastIndexOf('.');
      if (dot >= 0 && CPP_EXTS.has(full.slice(dot).toLowerCase())) out.push(full);
    }
  }
}

function lineOfOffset(text: string, offset: number): number {
  // 1-based line number containing `offset`.
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function splitSpecifiers(s: string): string[] {
  // Split on top-level commas only (don't split inside parens / strings).
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  let inStr = false;
  for (const ch of s) {
    if (inStr) {
      buf += ch;
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ')') {
      depth--;
      buf += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const trimmed = buf.trim();
  if (trimmed) out.push(trimmed);
  return out;
}

const UCLASS_RE = /UCLASS\s*\(([^)]*)\)\s*([\s\S]*?)\bclass\s+(?:[A-Z][A-Z0-9_]*_API\s+)?(\w+)\s*(?::\s*public\s+(\w+))?[^{]*\{([\s\S]*?)\bGENERATED_BODY\s*\(/g;

function extractUClasses(text: string): CppUClass[] {
  const out: CppUClass[] = [];
  let m: RegExpExecArray | null;
  // Case 1: UCLASS … class … : public Base { … GENERATED_BODY()
  while ((m = UCLASS_RE.exec(text)) !== null) {
    out.push({
      name: m[3]!,
      base: m[4],
      specifiers: splitSpecifiers(m[1]!),
      line: lineOfOffset(text, m.index),
      hasGeneratedBody: true,
    });
  }
  // Case 2: UCLASS without GENERATED_BODY (still record but flag it).
  const simpleRe = /UCLASS\s*\(([^)]*)\)\s*([\s\S]{0,200}?)\bclass\s+(?:[A-Z][A-Z0-9_]*_API\s+)?(\w+)\s*(?::\s*public\s+(\w+))?/g;
  let s: RegExpExecArray | null;
  while ((s = simpleRe.exec(text)) !== null) {
    const name = s[3]!;
    if (out.some((u) => u.name === name)) continue; // already captured by full regex
    out.push({
      name,
      base: s[4],
      specifiers: splitSpecifiers(s[1]!),
      line: lineOfOffset(text, s.index),
      hasGeneratedBody: false,
    });
  }
  return out;
}

function extractUFunctions(text: string): CppUFunction[] {
  const out: CppUFunction[] = [];
  const re = /UFUNCTION\s*\(([^)]*)\)\s*[\s\S]{0,200}?\b([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      name: m[2]!,
      specifiers: splitSpecifiers(m[1]!),
      line: lineOfOffset(text, m.index),
    });
  }
  return out;
}

function extractUProperties(text: string): CppUProperty[] {
  const out: CppUProperty[] = [];
  // UPROPERTY(...) [maybe newlines] <type> Name (; or =).
  const re = /UPROPERTY\s*\(([^)]*)\)\s*[\s\S]{0,200}?\b\w+\s+([A-Za-z_]\w*)\s*[;={]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      name: m[2]!,
      specifiers: splitSpecifiers(m[1]!),
      line: lineOfOffset(text, m.index),
    });
  }
  return out;
}
