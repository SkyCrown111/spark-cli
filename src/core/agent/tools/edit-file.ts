/**
 * edit_file: read + unique-string-replace patch.
 *
 * - Multi-pair: model can supply an array of `{old_string, new_string}` edits;
 *   they're applied in order against the file's current bytes (after each
 *   prior edit), so the model can sequence changes safely.
 * - Unique-match required: if `old_string` appears more than once, the tool
 *   returns the count and a recommendation, so the model can disambiguate
 *   with more surrounding context.
 * - Same staging/direct branch as `write_file`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { stageWriteFile } from '../../staging/patch-manager.js';
import { appendReplayEvent } from '../../replay/log.js';
import { resolveProjectPath } from './read-file.js';
import { getErrorMessage } from '../../../utils/errors.js';

interface EditPair {
  old_string: string;
  new_string: string;
}

function countOccurrences(s: string, sub: string): number {
  if (!sub) return 0;
  let n = 0;
  let i = 0;
  while ((i = s.indexOf(sub, i)) !== -1) {
    n++;
    i += sub.length;
  }
  return n;
}

async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const path = args.path;
  const single = typeof args.old_string === 'string' && typeof args.new_string === 'string';
  const editsRaw = args.edits;

  if (typeof path !== 'string') {
    return { content: 'edit_file: `path` must be a string', isError: true };
  }
  if (!single && !Array.isArray(editsRaw)) {
    return {
      content:
        'edit_file: provide either {old_string, new_string} or {edits: [{old_string, new_string}, …]}',
      isError: true,
    };
  }

  const edits: EditPair[] = single
    ? [{ old_string: args.old_string as string, new_string: args.new_string as string }]
    : (editsRaw as EditPair[]).filter(
        (e) =>
          e &&
          typeof e === 'object' &&
          typeof e.old_string === 'string' &&
          typeof e.new_string === 'string',
      );
  if (edits.length === 0) {
    return { content: 'edit_file: no valid edits supplied', isError: true };
  }

  const r = resolveProjectPath(ctx, path);
  if (!r.ok) return { content: `edit_file: ${r.reason}`, isError: true };
  const target = join(ctx.projectRoot, r.rel);
  if (!existsSync(target)) {
    return {
      content: `edit_file: file not found: ${r.rel}. Use write_file to create it.`,
      isError: true,
    };
  }

  let current: string;
  try {
    current = readFileSync(target, 'utf8');
  } catch (e) {
    return {
      content: `edit_file: could not read ${r.rel}: ${getErrorMessage(e)}`,
      isError: true,
    };
  }

  let i = 0;
  for (const edit of edits) {
    if (edit.old_string === edit.new_string) {
      return {
        content: `edit_file: edit #${i + 1} has identical old_string and new_string`,
        isError: true,
      };
    }
    const count = countOccurrences(current, edit.old_string);
    if (count === 0) {
      return {
        content:
          `edit_file: edit #${i + 1} old_string not found in ${r.rel}. ` +
          `Check exact whitespace, indentation, and line endings.`,
        isError: true,
      };
    }
    if (count > 1) {
      return {
        content:
          `edit_file: edit #${i + 1} old_string matches ${count} places in ${r.rel}. ` +
          `Add more surrounding context to make it unique.`,
        isError: true,
      };
    }
    current = current.replace(edit.old_string, edit.new_string);
    i++;
  }

  if (ctx.writeMode === 'staging') {
    try {
      stageWriteFile(ctx.projectRoot, r.rel, current);
    } catch (e) {
      return {
        content: `edit_file: staging failed: ${getErrorMessage(e)}`,
        isError: true,
      };
    }
    appendReplayEvent(ctx.projectRoot, 'tool_call', {
      tool: 'edit_file',
      mode: 'staging',
      path: r.rel,
      edits: edits.length,
      agentId: ctx.agentId,
      parentAgentId: ctx.parentAgentId,
    });
    return {
      content: `Staged ${edits.length} edit(s) to ${r.rel}.`,
      structured: { staged: true, path: r.rel, edits: edits.length },
    };
  }

  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, current, 'utf8');
  } catch (e) {
    return {
      content: `edit_file: direct write failed: ${getErrorMessage(e)}`,
      isError: true,
    };
  }
  appendReplayEvent(ctx.projectRoot, 'tool_call', {
    tool: 'edit_file',
    mode: 'direct',
    path: r.rel,
    edits: edits.length,
    agentId: ctx.agentId,
    parentAgentId: ctx.parentAgentId,
  });
  return {
    content: `Applied ${edits.length} edit(s) directly to ${r.rel}.`,
    structured: { staged: false, path: r.rel, edits: edits.length },
  };
}

export const editFileTool: RegisteredTool = {
  name: 'edit_file',
  description:
    'Edit an existing file by replacing exact strings. Each old_string must match exactly once. ' +
    'Use {old_string, new_string} for one edit, or {edits: [...]} for multiple.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to the project root.' },
      old_string: {
        type: 'string',
        description: 'Exact substring to replace. Must appear exactly once.',
      },
      new_string: {
        type: 'string',
        description: 'Replacement text.',
      },
      edits: {
        type: 'array',
        description: 'Multiple edits, applied in order. Use instead of old/new_string.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string' },
            new_string: { type: 'string' },
          },
          required: ['old_string', 'new_string'],
          additionalProperties: false,
        },
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  handler,
};
