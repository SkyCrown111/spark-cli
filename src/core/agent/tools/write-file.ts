/**
 * write_file: stage or directly write a file.
 *
 * - `staging` mode: routes through `stageWriteFile` so nothing touches the
 *   project tree until `spark-cli apply`.
 * - `direct` mode (`--auto` / `/auto`): writes to disk and emits a `tool_call`
 *   replay event so revert semantics survive.
 *
 * The same path validation as `read_file` applies.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { stageWriteFile } from '../../staging/patch-manager.js';
import { appendReplayEvent } from '../../replay/log.js';
import { resolveProjectPath } from './read-file.js';

const DEFAULT_MAX_WRITE_BYTES = 5 * 1024 * 1024; // 5 MB

function getMaxWriteBytes(ctx: ToolContext): number {
  const cfg = (ctx.config as { tools?: { write?: { maxBytes?: number } } }).tools?.write;
  const v = cfg?.maxBytes;
  return typeof v === 'number' && v > 0 ? v : DEFAULT_MAX_WRITE_BYTES;
}

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const path = args.path;
  const content = args.content;

  if (typeof path !== 'string') {
    return { content: 'write_file: `path` must be a string', isError: true };
  }
  if (typeof content !== 'string') {
    return {
      content: 'write_file: `content` must be a string',
      isError: true,
    };
  }
  const max = getMaxWriteBytes(ctx);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > max) {
    return {
      content: `write_file: content is ${bytes} bytes; exceeds the ${max}-byte cap. Split the change or raise tools.write.maxBytes.`,
      isError: true,
    };
  }
  const r = resolveProjectPath(ctx, path);
  if (!r.ok) return { content: `write_file: ${r.reason}`, isError: true };

  if (ctx.writeMode === 'staging') {
    try {
      stageWriteFile(ctx.projectRoot, r.rel, content);
    } catch (e) {
      return {
        content: `write_file: staging failed: ${(e as Error).message}`,
        isError: true,
      };
    }
    appendReplayEvent(ctx.projectRoot, 'tool_call', {
      tool: 'write_file',
      mode: 'staging',
      path: r.rel,
      bytes: Buffer.byteLength(content, 'utf8'),
      agentId: ctx.agentId,
      parentAgentId: ctx.parentAgentId,
    });
    return {
      content: `Staged ${r.rel} (${content.length} chars). Use /diff to inspect, /apply to commit.`,
      structured: { staged: true, path: r.rel },
    };
  }

  // direct mode (--auto / /auto)
  const target = join(ctx.projectRoot, r.rel);
  const isCreate = !existsSync(target);
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  } catch (e) {
    return {
      content: `write_file: direct write failed: ${(e as Error).message}`,
      isError: true,
    };
  }
  appendReplayEvent(ctx.projectRoot, 'tool_call', {
    tool: 'write_file',
    mode: 'direct',
    path: r.rel,
    action: isCreate ? 'create' : 'modify',
    bytes: Buffer.byteLength(content, 'utf8'),
    agentId: ctx.agentId,
    parentAgentId: ctx.parentAgentId,
  });
  return {
    content: `Wrote ${r.rel} directly (${content.length} chars).`,
    structured: { staged: false, path: r.rel },
  };
}

export const writeFileTool: RegisteredTool = {
  name: 'write_file',
  description:
    'Create or overwrite a file. Defaults to staging (.spark-cli/staging/) — the project tree is only updated when the user runs /apply or starts in --auto/`/auto` mode for direct writes.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to the project root.' },
      content: {
        type: 'string',
        description: 'Full file contents. Newlines should be \\n.',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  handler,
};
