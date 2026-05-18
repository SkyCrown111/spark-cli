/**
 * grep: regex search across project files.
 *
 * - Default: walks the project tree (same ignore set as glob), reads each
 *   file, applies the regex line-by-line, returns up to N matches.
 * - Optional `glob` filter narrows the candidate set first.
 * - Skips files larger than 1 MB by default to bound work.
 *
 * No ripgrep dep — pure JS scanner. The agent loop's use cases (small file
 * sets, find-by-pattern) don't justify the binary detection cost.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { __glob } from './glob.js';

const DEFAULT_MAX_MATCHES = 200;
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_CONTEXT_LINES = 10;

function getMaxMatches(ctx: ToolContext): number {
  const m = ctx.config.tools?.grep?.maxMatches;
  return typeof m === 'number' && m > 0 ? m : DEFAULT_MAX_MATCHES;
}

interface Match {
  path: string;
  line: number;
  text: string;
  /** Optional context (before/after) lines. */
  before?: { line: number; text: string }[];
  after?: { line: number; text: string }[];
}

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const pattern = args.pattern;
  let flags = typeof args.flags === 'string' ? args.flags : '';
  if (args.case_insensitive === true && !flags.includes('i')) flags += 'i';
  const globPattern = typeof args.glob === 'string' ? args.glob : '**/*';
  const limitMax = getMaxMatches(ctx);
  const limitArg = typeof args.limit === 'number' ? args.limit : limitMax;
  const limit = Math.min(Math.max(1, Math.floor(limitArg)), limitMax);
  const beforeArg = typeof args.before === 'number' ? args.before : 0;
  const afterArg = typeof args.after === 'number' ? args.after : 0;
  const before = Math.min(Math.max(0, Math.floor(beforeArg)), MAX_CONTEXT_LINES);
  const after = Math.min(Math.max(0, Math.floor(afterArg)), MAX_CONTEXT_LINES);

  if (typeof pattern !== 'string' || pattern.length === 0) {
    return { content: 'grep: `pattern` must be a non-empty string', isError: true };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (e) {
    return { content: `grep: invalid regex: ${(e as Error).message}`, isError: true };
  }

  let candidateFiles: string[];
  try {
    const matcher = __glob.globToRegExp(globPattern);
    candidateFiles = __glob.walk(ctx.projectRoot, matcher, __glob.DEFAULT_IGNORE, 5000).matches;
  } catch (e) {
    return { content: `grep: glob filter invalid: ${(e as Error).message}`, isError: true };
  }

  const matches: Match[] = [];
  let truncated = false;
  let scannedFiles = 0;
  outer: for (const rel of candidateFiles) {
    const abs = join(ctx.projectRoot, rel);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) continue;
    scannedFiles++;
    let text: string;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        const m: Match = { path: rel, line: i + 1, text: lines[i] };
        if (before > 0) {
          const ctx: { line: number; text: string }[] = [];
          for (let j = Math.max(0, i - before); j < i; j++) {
            ctx.push({ line: j + 1, text: lines[j] });
          }
          if (ctx.length > 0) m.before = ctx;
        }
        if (after > 0) {
          const ctx: { line: number; text: string }[] = [];
          for (let j = i + 1; j < Math.min(lines.length, i + 1 + after); j++) {
            ctx.push({ line: j + 1, text: lines[j] });
          }
          if (ctx.length > 0) m.after = ctx;
        }
        matches.push(m);
        if (matches.length >= limit) {
          truncated = true;
          break outer;
        }
      }
    }
  }

  if (matches.length === 0) {
    return {
      content: `grep: no matches for /${pattern}/${flags} in ${globPattern} (${scannedFiles} files scanned)`,
      structured: { matches: [], scannedFiles },
    };
  }

  const renderLine = (path: string, line: number, text: string, sep: ':' | '-'): string =>
    `${path}${sep}${line}${sep} ${text.length > 240 ? text.slice(0, 240) + '…' : text}`;
  const groups: string[] = [];
  for (const m of matches) {
    const block: string[] = [];
    for (const b of m.before ?? []) block.push(renderLine(m.path, b.line, b.text, '-'));
    block.push(renderLine(m.path, m.line, m.text, ':'));
    for (const a of m.after ?? []) block.push(renderLine(m.path, a.line, a.text, '-'));
    groups.push(block.join('\n'));
  }
  const sep = before + after > 0 ? '\n--\n' : '\n';
  const trailer = truncated ? `\n… (truncated at ${limit} matches; refine the pattern)` : '';
  return {
    content: `${groups.join(sep)}${trailer}`,
    structured: { matches, scannedFiles, truncated },
  };
}

export const grepTool: RegisteredTool = {
  name: 'grep',
  description:
    'Regex search across project files. Optional `glob` filter (e.g. "src/**/*.ts"). Returns lines as path:line: text. Set `before`/`after` for context lines, `case_insensitive: true` for case-insensitive search.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'JavaScript-flavor regex source.',
      },
      flags: {
        type: 'string',
        description: 'Regex flags (e.g. "i", "m"). Defaults to none.',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Convenience flag — appends "i" to flags if not already present.',
      },
      before: {
        type: 'integer',
        minimum: 0,
        maximum: MAX_CONTEXT_LINES,
        description: 'Number of context lines to show before each match.',
      },
      after: {
        type: 'integer',
        minimum: 0,
        maximum: MAX_CONTEXT_LINES,
        description: 'Number of context lines to show after each match.',
      },
      glob: {
        type: 'string',
        description: 'Optional glob to narrow the candidate file set. Default "**/*".',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        description: `Max matches. Configurable via tools.grep.maxMatches; default ${DEFAULT_MAX_MATCHES}.`,
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  handler,
};
