import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export interface KnowledgeChunk {
  id: string;
  source: string;
  title: string;
  text: string;
  tokens: string[];
}

export interface KnowledgeIndex {
  version: 1;
  builtAt: string;
  chunks: KnowledgeChunk[];
}

/** Word + CJK bigram tokens for BM25-style search. */
export function tokenize(text: string): string[] {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();

  for (const word of lower.replace(/[\u4e00-\u9fff]+/g, ' ').split(/\s+/)) {
    if (word.length > 1) tokens.add(word);
  }

  for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    const s = run.toLowerCase();
    if (s.length === 1) tokens.add(s);
    for (let i = 0; i < s.length - 1; i++) tokens.add(s.slice(i, i + 2));
  }

  return [...tokens];
}

function splitMarkdown(path: string, content: string): { title: string; text: string }[] {
  const parts: { title: string; text: string }[] = [];
  const sections = content.split(/^#\s+/m);
  for (const sec of sections) {
    if (!sec.trim()) continue;
    const lines = sec.split('\n');
    const title = lines[0]?.trim() || path;
    const text = lines.slice(1).join('\n').trim() || sec.trim();
    parts.push({ title, text });
  }
  if (!parts.length) parts.push({ title: path, text: content });
  return parts;
}

function collectMdFiles(dir: string, root: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectMdFiles(full, root, out);
    } else if (name.endsWith('.md')) {
      out.push(relative(root, full).replace(/\\/g, '/'));
    }
  }
}

export function getBuiltinKnowledgeDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'knowledge'),
    join(here, '..', 'knowledge'),
    join(here, '..', '..', '..', 'knowledge'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir) && dir !== here) return dir;
  }
  return join(here, '..', 'knowledge');
}

export function buildKnowledgeIndex(dirs: string[]): KnowledgeIndex {
  const chunks: KnowledgeChunk[] = [];
  let id = 0;

  for (const root of dirs) {
    if (!existsSync(root)) continue;
    const files: string[] = [];
    collectMdFiles(root, root, files);
    for (const rel of files) {
      const full = join(root, rel);
      const content = readFileSync(full, 'utf8');
      for (const section of splitMarkdown(rel, content)) {
        const text = section.text;
        chunks.push({
          id: `chunk-${id++}`,
          source: rel,
          title: section.title,
          text,
          tokens: tokenize(`${section.title} ${text}`),
        });
      }
    }
  }

  return {
    version: 1,
    builtAt: new Date().toISOString(),
    chunks,
  };
}

export function saveIndex(projectRoot: string, index: KnowledgeIndex): string {
  const cacheDir = join(projectRoot, '.spark-cli', 'cache');
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const path = join(cacheDir, 'knowledge-index.json');
  writeFileSync(path, JSON.stringify(index, null, 2), 'utf8');
  return path;
}

export function loadIndex(projectRoot: string): KnowledgeIndex | null {
  const path = join(projectRoot, '.spark-cli', 'cache', 'knowledge-index.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as KnowledgeIndex;
}
