/**
 * list_dir: directory listing (shallow by default, optional recursive).
 *
 * Returns `path/ (dir)` for directories and `path (size bytes)` for files,
 * one per line. Same ignore set as glob/grep.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { resolveProjectPath } from './read-file.js';
import { __glob } from './glob.js';
import { getErrorMessage } from '../../../utils/errors.js';

const MAX_RECURSIVE_ENTRIES = 2000;
const MAX_RECURSIVE_DEPTH = 6;

interface ListedEntry {
  name: string;
  rel: string;
  kind: 'dir' | 'file' | 'other';
  size?: number;
}

function walkDir(base: string, rel: string, depth: number, out: ListedEntry[], cap: number): void {
  if (out.length >= cap) return;
  if (depth > MAX_RECURSIVE_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(join(base, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (__glob.DEFAULT_IGNORE.has(ent.name)) continue;
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      out.push({ name: ent.name, rel: childRel, kind: 'dir' });
      if (out.length >= cap) return;
      walkDir(base, childRel, depth + 1, out, cap);
    } else if (ent.isFile()) {
      let size: number | undefined;
      try {
        size = statSync(join(base, childRel)).size;
      } catch {
        size = undefined;
      }
      out.push({ name: ent.name, rel: childRel, kind: 'file', size });
    } else {
      out.push({ name: ent.name, rel: childRel, kind: 'other' });
    }
    if (out.length >= cap) return;
  }
}

async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const path = typeof args.path === 'string' ? args.path : '.';
  const recursive = args.recursive === true;
  const r = resolveProjectPath(ctx, path);
  if (!r.ok) return { content: `list_dir: ${r.reason}`, isError: true };

  if (recursive) {
    const collected: ListedEntry[] = [];
    walkDir(r.abs, '', 0, collected, MAX_RECURSIVE_ENTRIES);
    if (collected.length === 0) {
      return { content: `(empty: ${r.rel || '.'})` };
    }
    const lines = collected
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .map((e) =>
        e.kind === 'dir'
          ? `${e.rel}/  (dir)`
          : e.kind === 'file'
            ? `${e.rel}  (${e.size ?? '?'} bytes)`
            : `${e.rel}  (other)`,
      );
    const truncated = collected.length >= MAX_RECURSIVE_ENTRIES;
    const trailer = truncated ? `\n… (truncated at ${MAX_RECURSIVE_ENTRIES} entries)` : '';
    return {
      content: lines.join('\n') + trailer,
      structured: { path: r.rel || '.', count: collected.length, recursive: true, truncated },
    };
  }

  let entries;
  try {
    entries = readdirSync(r.abs, { withFileTypes: true });
  } catch (e) {
    return {
      content: `list_dir: could not read ${r.rel || '.'}: ${getErrorMessage(e)}`,
      isError: true,
    };
  }

  const lines: string[] = [];
  for (const ent of entries) {
    if (__glob.DEFAULT_IGNORE.has(ent.name)) continue;
    if (ent.isDirectory()) {
      lines.push(`${ent.name}/  (dir)`);
    } else if (ent.isFile()) {
      try {
        const s = statSync(join(r.abs, ent.name));
        lines.push(`${ent.name}  (${s.size} bytes)`);
      } catch {
        lines.push(ent.name);
      }
    } else {
      lines.push(`${ent.name}  (other)`);
    }
  }
  if (lines.length === 0) {
    return { content: `(empty: ${r.rel || '.'})` };
  }
  return {
    content: lines.sort().join('\n'),
    structured: { path: r.rel || '.', count: lines.length },
  };
}

export const listDirTool: RegisteredTool = {
  name: 'list_dir',
  description:
    'List entries in a directory inside the project. Filters out .git/.spark/.spark-cli/node_modules/dist/build/Library. Set `recursive: true` for a depth-bounded tree walk.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to the project root. Defaults to ".".',
      },
      recursive: {
        type: 'boolean',
        description: `Walk subdirectories up to ${MAX_RECURSIVE_DEPTH} levels deep, capped at ${MAX_RECURSIVE_ENTRIES} entries.`,
      },
    },
    additionalProperties: false,
  },
  handler,
};
