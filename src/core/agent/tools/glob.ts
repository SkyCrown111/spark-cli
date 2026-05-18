/**
 * glob: list project files matching a glob pattern.
 *
 * Implementation:
 * - Recursive `fs.readdir` traversal with built-in ignore set (.spark-cli, .git,
 *   node_modules, dist, build, .vscode, Library/Temp/Logs for Unity).
 * - Lightweight glob → regex conversion supporting `*`, `**`, `?`, `[abc]`.
 * - Caps at 500 results to keep responses bounded; the model gets a marker
 *   when truncated.
 *
 * No new dependency; the lightweight matcher is enough for the agent loop's
 * use cases (file discovery, not full glob semantics).
 */

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';

const DEFAULT_IGNORE = new Set([
  '.git',
  '.spark-cli',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  '.vscode',
  '.idea',
  '.DS_Store',
  // Unity transient
  'Library',
  'Temp',
  'Logs',
  'obj',
]);

const MAX_RESULTS = 500;

function globToRegExp(pattern: string): RegExp {
  // Normalize separators to forward slashes.
  const normalized = pattern.replace(/\\/g, '/');
  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '*') {
      if (normalized[i + 1] === '*') {
        // ** matches across directories
        out += '.*';
        i++;
        if (normalized[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '[') {
      const close = normalized.indexOf(']', i);
      if (close === -1) {
        out += '\\[';
      } else {
        out += normalized.slice(i, close + 1);
        i = close;
      }
    } else if ('.+()^$|{}\\'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

interface WalkResult {
  matches: string[];
  truncated: boolean;
}

function walk(
  root: string,
  matcher: RegExp,
  ignore: Set<string>,
  maxResults: number,
): WalkResult {
  const out: string[] = [];
  let truncated = false;
  const stack: string[] = [root];
  while (stack.length > 0 && out.length < maxResults) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ignore.has(ent.name)) continue;
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(abs);
        continue;
      }
      const rel = relative(root, abs).split(sep).join('/');
      if (matcher.test(rel)) {
        out.push(rel);
        if (out.length >= maxResults) {
          truncated = true;
          break;
        }
      }
    }
  }
  return { matches: out.sort(), truncated };
}

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const pattern = args.pattern;
  const limitArg = typeof args.limit === 'number' ? args.limit : MAX_RESULTS;
  const limit = Math.min(Math.max(1, Math.floor(limitArg)), MAX_RESULTS);

  if (typeof pattern !== 'string' || pattern.trim().length === 0) {
    return { content: 'glob: `pattern` must be a non-empty string', isError: true };
  }

  let regex: RegExp;
  try {
    regex = globToRegExp(pattern);
  } catch (e) {
    return {
      content: `glob: invalid pattern: ${(e as Error).message}`,
      isError: true,
    };
  }

  const result = walk(ctx.projectRoot, regex, DEFAULT_IGNORE, limit);
  if (result.matches.length === 0) {
    return { content: `glob: no matches for ${pattern}`, structured: { matches: [] } };
  }
  const trailer = result.truncated
    ? `\n… (truncated to ${limit} results — refine the pattern)`
    : '';
  return {
    content: `${result.matches.join('\n')}${trailer}`,
    structured: { matches: result.matches, truncated: result.truncated },
  };
}

export const globTool: RegisteredTool = {
  name: 'glob',
  description:
    'Find files matching a glob pattern (e.g. "src/**/*.ts", "assets/**/*.png"). Skips .git/.spark-cli/node_modules/dist/build/Library by default.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern relative to the project root. Supports *, **, ?, [abc].',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_RESULTS,
        description: `Max results. Default ${MAX_RESULTS}.`,
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  handler,
};

// Exported for `grep.ts` reuse.
export const __glob = { walk, globToRegExp, DEFAULT_IGNORE };
