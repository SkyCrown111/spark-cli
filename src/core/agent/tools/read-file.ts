/**
 * read_file: read a file inside the project root.
 *
 * - Refuses paths outside `projectRoot` unless `tools.allowAbsolute` is set in
 *   config (off by default — least authority).
 * - Caps content at 256 KB to keep prompts bounded; the model gets a clear
 *   tail marker so it can ask for a different range.
 * - Returns line numbers prefixed (1:, 2:, …) so subsequent `edit_file` calls
 *   can speak in line-relative terms if the model wants.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';

const DEFAULT_MAX_BYTES = 256 * 1024;

function getMaxBytes(ctx: ToolContext): number {
  const cfg = (ctx.config as { tools?: { read?: { maxBytes?: number } } }).tools?.read;
  const v = cfg?.maxBytes;
  return typeof v === 'number' && v > 0 ? v : DEFAULT_MAX_BYTES;
}

/**
 * Truncate a UTF-8 string at byte boundary without splitting a multi-byte
 * codepoint. Walks back to the last full character.
 */
function truncateUtf8(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= maxBytes) return s;
  let cut = maxBytes;
  // UTF-8 continuation bytes start with 10xxxxxx (0x80–0xBF). Walk back to
  // the first byte of the last character.
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut -= 1;
  return buf.slice(0, cut).toString('utf8');
}

export function resolveProjectPath(
  ctx: ToolContext,
  rawPath: string,
  opts: { allowAbsolute?: boolean } = {},
): { ok: true; abs: string; rel: string } | { ok: false; reason: string } {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return { ok: false, reason: 'path must be a non-empty string' };
  }
  const allowAbsolute =
    opts.allowAbsolute ??
    ((ctx.config as { tools?: { allowAbsolute?: boolean } }).tools?.allowAbsolute ?? false);

  let abs: string;
  if (isAbsolute(rawPath)) {
    if (!allowAbsolute) {
      return {
        ok: false,
        reason: `Absolute paths are disabled. Pass a path relative to the project root.`,
      };
    }
    abs = normalize(rawPath);
  } else {
    abs = resolve(ctx.projectRoot, rawPath);
  }

  // Resolve symlinks so that a link inside the root cannot escape it.
  // realpathSync only works on existing paths, so we tolerate ENOENT for
  // not-yet-created files (write tools call this resolver too).
  try {
    abs = realpathSync(abs);
  } catch {
    // Path may not exist yet (e.g. write_file creating new file). Use the
    // un-resolved absolute path; the relative-check below still catches `..`.
  }

  let projectAbs = ctx.projectRoot;
  try {
    projectAbs = realpathSync(ctx.projectRoot);
  } catch {
    // projectRoot should always exist; keep the original on failure.
  }

  const rel = relative(projectAbs, abs);
  if (
    rel === '..' ||
    rel.startsWith(`..${sep}`) ||
    (isAbsolute(rel) && !allowAbsolute)
  ) {
    return {
      ok: false,
      reason: `Path escapes the project root: ${rawPath}`,
    };
  }
  // Block writes/reads under .spark-cli/ to keep tool history out of the
  // project's mutable state. Staging is reachable via dedicated paths only.
  const guardPrefix = `.spark-cli${sep}`;
  if (rel === '.spark-cli' || rel.startsWith(guardPrefix)) {
    return {
      ok: false,
      reason: `Path is inside .spark-cli/ (spark-cli internal state). Use staging tools instead.`,
    };
  }
  return { ok: true, abs, rel };
}

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const path = args.path;
  const offset = typeof args.offset === 'number' ? Math.max(0, Math.floor(args.offset)) : 0;
  const limit = typeof args.limit === 'number' ? Math.max(1, Math.floor(args.limit)) : undefined;
  const includeLineNumbers = args.line_numbers !== false;

  if (typeof path !== 'string') {
    return { content: 'read_file: `path` must be a string', isError: true };
  }
  const r = resolveProjectPath(ctx, path);
  if (!r.ok) return { content: `read_file: ${r.reason}`, isError: true };

  if (!existsSync(r.abs)) {
    return { content: `read_file: file not found: ${r.rel}`, isError: true };
  }
  const stat = statSync(r.abs);
  if (stat.isDirectory()) {
    return { content: `read_file: ${r.rel} is a directory; use list_dir`, isError: true };
  }

  let raw: string;
  try {
    raw = readFileSync(r.abs, 'utf8');
  } catch (e) {
    return {
      content: `read_file: could not read ${r.rel}: ${(e as Error).message}`,
      isError: true,
    };
  }

  const allLines = raw.split(/\r?\n/);
  const start = offset;
  const end = limit ? Math.min(allLines.length, start + limit) : allLines.length;
  const slice = allLines.slice(start, end);

  let body: string;
  if (includeLineNumbers) {
    body = slice.map((line, i) => `${start + i + 1}\t${line}`).join('\n');
  } else {
    body = slice.join('\n');
  }

  let truncated = false;
  const maxBytes = getMaxBytes(ctx);
  if (Buffer.byteLength(body, 'utf8') > maxBytes) {
    body = truncateUtf8(body, maxBytes);
    truncated = true;
  }

  const trailer: string[] = [];
  if (truncated) trailer.push(`… (truncated to ${Math.round(maxBytes / 1024)} KB)`);
  if (end < allLines.length) {
    trailer.push(
      `… ${allLines.length - end} more line(s); call again with offset=${end}`,
    );
  }
  if (trailer.length > 0) body += `\n${trailer.join('\n')}`;

  return {
    content: body || '(empty file)',
    structured: { path: r.rel, lines: allLines.length, offset, end },
  };
}

export const readFileTool: RegisteredTool = {
  name: 'read_file',
  description:
    'Read a file inside the project. Returns line-numbered content. Use offset/limit to page through large files.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path relative to the project root.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Line index (0-based) to start from. Defaults to 0.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        description: 'Maximum number of lines to return.',
      },
      line_numbers: {
        type: 'boolean',
        description: 'Prefix each line with its 1-based line number. Default true.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  handler,
};
