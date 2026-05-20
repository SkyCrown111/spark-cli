/**
 * Unreal C++ outline via tree-sitter-cpp (optional).
 * Falls back to null when `tree-sitter` / `tree-sitter-cpp` are not installed.
 */

import { probeOptionalRequire } from '../../utils/optional-module.js';
import type { CppOutlineEntry, CppUClass, CppUFunction, CppUProperty } from './cpp-index.js';

interface TsNode {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number };
  childCount: number;
  child(index: number): TsNode | null;
  childForFieldName(name: string): TsNode | null;
}

interface TsParser {
  setLanguage(language: unknown): void;
  parse(input: string): { rootNode: TsNode };
}

let parserCache: TsParser | null | undefined;

export function isTreeSitterCppAvailable(): boolean {
  return probeOptionalRequire('tree-sitter').ok && probeOptionalRequire('tree-sitter-cpp').ok;
}

function getParser(): TsParser | null {
  if (parserCache !== undefined) return parserCache;
  const tsHit = probeOptionalRequire('tree-sitter');
  const cppHit = probeOptionalRequire('tree-sitter-cpp');
  if (!tsHit.ok || !cppHit.ok) {
    parserCache = null;
    return null;
  }
  const tsMod = tsHit.module as { default?: new () => TsParser } | (new () => TsParser);
  const ParserCtor =
    typeof tsMod === 'function' ? tsMod : tsMod.default;
  if (!ParserCtor) {
    parserCache = null;
    return null;
  }
  const cppMod = cppHit.module as { default?: unknown };
  const cppLang = cppMod.default ?? cppHit.module;
  const parser = new ParserCtor();
  parser.setLanguage(cppLang);
  parserCache = parser;
  return parser;
}

export function parseCppOutlineAst(text: string): Omit<CppOutlineEntry, 'file'> | null {
  const parser = getParser();
  if (!parser) return null;

  const tree = parser.parse(text);
  const uclasses: CppUClass[] = [];
  const ufunctions: CppUFunction[] = [];
  const uproperties: CppUProperty[] = [];

  walk(tree.rootNode, (node) => {
    if (node.type === 'class_specifier') {
      const nameNode = node.childForFieldName('name') ?? findDescendant(node, 'type_identifier');
      if (!nameNode) return;
      const spec = macroSpecBefore(text, node.startIndex, 'UCLASS');
      if (!spec) return;
      const bodySlice = text.slice(node.startIndex, Math.min(text.length, node.endIndex + 80));
      uclasses.push({
        name: nameNode.text,
        base: extractBaseClass(text, node.startIndex),
        specifiers: splitSpecifiers(spec),
        line: node.startPosition.row + 1,
        hasGeneratedBody: /\bGENERATED_BODY\s*\(/.test(bodySlice),
      });
    }

    if (node.type === 'function_definition') {
      const spec = macroSpecBefore(text, node.startIndex, 'UFUNCTION');
      if (!spec) return;
      const name = extractFunctionName(node) ?? extractNameNear(text, node.startIndex, node.endIndex);
      if (!name) return;
      ufunctions.push({
        name,
        specifiers: splitSpecifiers(spec),
        line: node.startPosition.row + 1,
      });
    }

    if (node.type === 'field_declaration') {
      const spec = macroSpecBefore(text, node.startIndex, 'UPROPERTY');
      if (!spec) return;
      const name = extractFieldName(node) ?? extractNameNear(text, node.startIndex, node.endIndex);
      if (!name) return;
      uproperties.push({
        name,
        specifiers: splitSpecifiers(spec),
        line: node.startPosition.row + 1,
      });
    }
  });

  return { uclasses, ufunctions, uproperties };
}

function walk(node: TsNode, fn: (n: TsNode) => void): void {
  fn(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, fn);
  }
}

function findDescendant(node: TsNode, type: string): TsNode | null {
  if (node.type === type) return node;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const hit = findDescendant(child, type);
    if (hit) return hit;
  }
  return null;
}

function macroSpecBefore(text: string, index: number, macro: string): string | null {
  const start = Math.max(0, index - 800);
  const slice = text.slice(start, index);
  const re = new RegExp(`${macro}\\s*\\(([^)]*)\\)\\s*(?:\\r?\\n\\s*)*$`);
  const m = slice.match(re);
  return m ? m[1]! : null;
}

function extractBaseClass(text: string, classStart: number): string | undefined {
  const slice = text.slice(classStart, classStart + 400);
  const m = slice.match(/:\s*public\s+(\w+)/);
  return m?.[1];
}

function extractFunctionName(node: TsNode): string | null {
  const decl = node.childForFieldName('declarator');
  if (!decl) return null;
  const id = findDescendant(decl, 'identifier') ?? findDescendant(decl, 'field_identifier');
  return id?.text ?? null;
}

function extractFieldName(node: TsNode): string | null {
  const decl = node.childForFieldName('declarator');
  if (decl) {
    const id = findDescendant(decl, 'identifier') ?? findDescendant(decl, 'field_identifier');
    if (id) return id.text;
  }
  const ids: TsNode[] = [];
  walk(node, (n) => {
    if (n.type === 'identifier' || n.type === 'field_identifier') ids.push(n);
  });
  return ids.at(-1)?.text ?? null;
}

function extractNameNear(text: string, start: number, end: number): string | null {
  const slice = text.slice(start, end);
  const m = slice.match(/\b([A-Za-z_]\w*)\s*\([^;]*\)\s*;/) ?? slice.match(/\b(\w+)\s*[;=]/);
  return m?.[1] ?? null;
}

function splitSpecifiers(s: string): string[] {
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
