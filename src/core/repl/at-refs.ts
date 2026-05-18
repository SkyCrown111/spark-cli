import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, normalize } from 'node:path';

const AT_REF = /@([^\s@]+)/g;
const MAX_FILE_BYTES = 12 * 1024;
const MAX_DIR_ENTRIES = 40;
const MAX_TOTAL_BYTES = 32 * 1024;

export interface AtRefExpansion {
  /** User text with @tokens replaced by readable labels (optional). */
  displayText: string;
  /** Full user message sent to the agent (context block + original request). */
  agentText: string;
  refs: string[];
}

function resolveRefPath(projectRoot: string, raw: string): string | null {
  const cleaned = raw.replace(/^["']|["']$/g, '');
  const abs = normalize(join(projectRoot, cleaned));
  const rel = relative(projectRoot, abs);
  if (rel.startsWith('..') || rel.includes('..\\')) return null;
  if (!existsSync(abs)) return null;
  return abs;
}

function readFileSnippet(absPath: string, rel: string): string {
  const buf = readFileSync(absPath);
  if (buf.length > MAX_FILE_BYTES) {
    const text = buf.subarray(0, MAX_FILE_BYTES).toString('utf8');
    return `### @${rel}\n\`\`\`\n${text}\n…[truncated ${buf.length - MAX_FILE_BYTES} bytes]\n\`\`\``;
  }
  const text = buf.toString('utf8');
  return `### @${rel}\n\`\`\`\n${text}\n\`\`\``;
}

function listDirSnippet(absPath: string, rel: string): string {
  const entries = readdirSync(absPath)
    .slice(0, MAX_DIR_ENTRIES)
    .map((name) => {
      const full = join(absPath, name);
      const kind = statSync(full).isDirectory() ? 'dir' : 'file';
      return `- ${kind}: ${name}`;
    });
  const more =
    readdirSync(absPath).length > MAX_DIR_ENTRIES
      ? `\n…[${readdirSync(absPath).length - MAX_DIR_ENTRIES} more entries]`
      : '';
  return `### @${rel}/\n${entries.join('\n')}${more}`;
}

/**
 * Expand `@path` references in REPL input into a context block prepended to the
 * agent user message (Claude Code–style `@` mentions).
 */
export function expandAtReferences(projectRoot: string, input: string): AtRefExpansion {
  const refs = [...input.matchAll(AT_REF)].map((m) => m[1]!);
  if (refs.length === 0) {
    return { displayText: input, agentText: input, refs: [] };
  }

  const blocks: string[] = [];
  let total = 0;
  const seen = new Set<string>();

  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const abs = resolveRefPath(projectRoot, ref);
    if (!abs) {
      blocks.push(`### @${ref}\n(not found under project root)`);
      continue;
    }
    const rel = relative(projectRoot, abs).replace(/\\/g, '/');
    let block: string;
    if (statSync(abs).isDirectory()) {
      block = listDirSnippet(abs, rel);
    } else {
      block = readFileSnippet(abs, rel);
    }
    total += block.length;
    if (total > MAX_TOTAL_BYTES) {
      blocks.push(`### @${ref}\n(skipped — total @ context budget exceeded)`);
      break;
    }
    blocks.push(block);
  }

  const context = ['## Referenced paths (@)', ...blocks].join('\n\n');
  const agentText = `${context}\n\n## User request\n${input}`;
  return { displayText: input, agentText, refs: [...seen] };
}
