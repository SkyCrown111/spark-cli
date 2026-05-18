/**
 * Cross-session, file-based memory store. Lives at
 * `~/.spark-cli/projects/<slug>/memory/` so memories follow a project across
 * machines (when synced) and survive REPL restarts.
 *
 * Each memory is a small markdown file with YAML frontmatter:
 *
 *   ---
 *   name: user_role
 *   description: senior Go engineer, new to React
 *   type: user
 *   ---
 *
 *   <body — feedback/project bodies should include **Why:** and **How to apply:**>
 *
 * `MEMORY.md` is the index — one bullet per memory, kept under ~150 chars per
 * line. The index is regenerated whenever a memory is saved or deleted.
 *
 * Categories mirror Claude Code's memory taxonomy:
 *   user      — facts about the user's role / preferences / knowledge
 *   feedback  — corrections + validated approaches the user gave
 *   project   — ongoing work, decisions, deadlines (decay quickly)
 *   reference — pointers to external systems (Linear, dashboards, …)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getCrossSessionMemoryDir } from '../../config/paths.js';

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryRecord {
  /** Filename without `.md`. Slug-safe ASCII. */
  id: string;
  /** Frontmatter `name`. Display title. */
  name: string;
  /** Frontmatter `description`. One-line hook used by the index. */
  description: string;
  type: MemoryType;
  /** Raw markdown body (frontmatter stripped). */
  body: string;
  /** Last-modified epoch ms. */
  updatedAt: number;
}

const VALID_TYPES: readonly MemoryType[] = ['user', 'feedback', 'project', 'reference'];
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.md$/i;

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'memory';
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const meta: Record<string, string> = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(line.trim());
    if (m) meta[m[1]!] = (m[2] ?? '').trim();
  }
  return { meta, body };
}

function formatRecord(rec: Pick<MemoryRecord, 'name' | 'description' | 'type' | 'body'>): string {
  const fm = `---\nname: ${rec.name}\ndescription: ${rec.description}\ntype: ${rec.type}\n---\n\n`;
  return fm + rec.body.replace(/\s+$/, '') + '\n';
}

export function listMemories(projectRoot: string): MemoryRecord[] {
  const dir = getCrossSessionMemoryDir(projectRoot);
  if (!existsSync(dir)) return [];
  const out: MemoryRecord[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'MEMORY.md' || !FILENAME_RE.test(name)) continue;
    const path = join(dir, name);
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); } catch { continue; }
    const parsed = parseFrontmatter(raw);
    if (!parsed) continue;
    const type = (VALID_TYPES as readonly string[]).includes(parsed.meta.type ?? '')
      ? (parsed.meta.type as MemoryType)
      : 'project';
    let updatedAt = 0;
    try { updatedAt = statSync(path).mtimeMs; } catch { /* ignore */ }
    out.push({
      id: basename(name, '.md'),
      name: parsed.meta.name ?? basename(name, '.md'),
      description: parsed.meta.description ?? '',
      type,
      body: parsed.body,
      updatedAt,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getMemory(projectRoot: string, id: string): MemoryRecord | null {
  return listMemories(projectRoot).find((m) => m.id === id) ?? null;
}

export function saveMemory(
  projectRoot: string,
  input: { id?: string; name: string; description: string; type: MemoryType; body: string },
): MemoryRecord {
  if (!VALID_TYPES.includes(input.type)) {
    throw new Error(`invalid memory type "${input.type}"`);
  }
  const dir = getCrossSessionMemoryDir(projectRoot);
  ensureDir(dir);
  const id = (input.id && FILENAME_RE.test(`${input.id}.md`)) ? input.id : slugify(input.name);
  const path = join(dir, `${id}.md`);
  writeFileSync(path, formatRecord(input), 'utf8');
  rebuildIndex(projectRoot);
  return {
    id,
    name: input.name,
    description: input.description,
    type: input.type,
    body: input.body,
    updatedAt: Date.now(),
  };
}

export function deleteMemory(projectRoot: string, id: string): boolean {
  const dir = getCrossSessionMemoryDir(projectRoot);
  const path = join(dir, `${id}.md`);
  if (!existsSync(path)) return false;
  rmSync(path);
  rebuildIndex(projectRoot);
  return true;
}

export function searchMemories(projectRoot: string, query: string): MemoryRecord[] {
  const q = query.toLowerCase().trim();
  if (!q) return listMemories(projectRoot);
  const tokens = q.split(/\s+/);
  return listMemories(projectRoot).filter((m) => {
    const hay = `${m.name}\n${m.description}\n${m.body}\n${m.type}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

function rebuildIndex(projectRoot: string): void {
  const dir = getCrossSessionMemoryDir(projectRoot);
  ensureDir(dir);
  const records = listMemories(projectRoot);
  const lines: string[] = [];
  for (const type of VALID_TYPES) {
    const subset = records.filter((r) => r.type === type);
    if (subset.length === 0) continue;
    lines.push(`## ${type}`);
    for (const r of subset) {
      const hook = r.description.length > 130 ? r.description.slice(0, 127) + '…' : r.description;
      lines.push(`- [${r.name}](${r.id}.md) — ${hook}`);
    }
    lines.push('');
  }
  writeFileSync(join(dir, 'MEMORY.md'), lines.join('\n').trim() + '\n', 'utf8');
}

export function readMemoryIndex(projectRoot: string): string {
  const dir = getCrossSessionMemoryDir(projectRoot);
  const path = join(dir, 'MEMORY.md');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}
