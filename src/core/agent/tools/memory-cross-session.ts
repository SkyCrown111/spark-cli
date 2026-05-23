/**
 * memory_*: cross-session, file-based memory tools.
 *
 * Stored under `~/.spark/projects/<slug>/memory/` so memories follow a
 * project across REPL restarts. Each memory is a markdown file with YAML
 * frontmatter (`name`, `description`, `type`); `MEMORY.md` is the index.
 *
 * Tool surface (separate from the legacy in-project `remember`/`recall`):
 *   memory_save    — create/update a memory
 *   memory_search  — substring search over name/description/body
 *   memory_list    — enumerate everything
 *   memory_delete  — remove a memory by id
 *
 * Categories: user / feedback / project / reference. Use feedback for
 * corrections + validated approaches; user for role/preferences; project for
 * deadlines/decisions; reference for pointers to external systems.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import {
  saveMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  type MemoryType,
} from '../../memory/cross-session-store.js';

const VALID_TYPES = ['user', 'feedback', 'project', 'reference'] as const;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function formatRecord(r: {
  id: string;
  name: string;
  type: MemoryType;
  description: string;
}): string {
  return `[${r.type}] ${r.id} — ${r.name}: ${r.description}`;
}

async function saveHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const name = asString(args.name);
  const description = asString(args.description);
  const body = asString(args.body);
  const type = asString(args.type) as MemoryType | undefined;
  const id = asString(args.id);

  if (!name) return { content: 'memory_save: `name` is required', isError: true };
  if (!description) return { content: 'memory_save: `description` is required', isError: true };
  if (!body) return { content: 'memory_save: `body` is required', isError: true };
  if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
    return {
      content: `memory_save: \`type\` must be one of ${VALID_TYPES.join(' | ')}`,
      isError: true,
    };
  }

  try {
    const rec = saveMemory(ctx.projectRoot, { id, name, description, type, body });
    return {
      content: `Saved memory ${rec.id} (${rec.type}).`,
      structured: { id: rec.id, type: rec.type },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `memory_save: ${msg}`, isError: true };
  }
}

async function searchHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const query = asString(args.query) ?? '';
  const hits = searchMemories(ctx.projectRoot, query);
  if (hits.length === 0) {
    return {
      content: query ? `memory_search: no hits for "${query}"` : '(no memories)',
      structured: { hits: [] },
    };
  }
  const lines = hits.map(formatRecord);
  return {
    content: lines.join('\n'),
    structured: {
      hits: hits.map((h) => ({ id: h.id, type: h.type, name: h.name, description: h.description })),
    },
  };
}

async function listHandler(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const items = listMemories(ctx.projectRoot);
  if (items.length === 0) return { content: '(no memories)', structured: { items: [] } };
  return {
    content: items.map(formatRecord).join('\n'),
    structured: {
      items: items.map((m) => ({
        id: m.id,
        type: m.type,
        name: m.name,
        description: m.description,
      })),
    },
  };
}

async function deleteHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = asString(args.id);
  if (!id) return { content: 'memory_delete: `id` is required', isError: true };
  const ok = deleteMemory(ctx.projectRoot, id);
  if (!ok) return { content: `memory_delete: no memory with id "${id}"`, isError: true };
  return { content: `Deleted memory ${id}.`, structured: { id, deleted: true } };
}

export const memorySaveTool: RegisteredTool = {
  name: 'memory_save',
  description:
    'Persist a memory under ~/.spark/projects/<slug>/memory/ so it survives REPL restarts. type=user|feedback|project|reference. Pair description (one-line hook) with a focused body.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Optional stable filename slug. Auto-derived from name if omitted.',
      },
      name: { type: 'string', description: 'Display title.' },
      description: { type: 'string', description: 'One-line hook used in the index.' },
      type: { type: 'string', enum: VALID_TYPES as unknown as string[] },
      body: {
        type: 'string',
        description:
          'Markdown body. For feedback/project, lead with the rule and include **Why:** + **How to apply:**.',
      },
    },
    required: ['name', 'description', 'type', 'body'],
    additionalProperties: false,
  },
  handler: saveHandler,
};

export const memorySearchTool: RegisteredTool = {
  name: 'memory_search',
  description:
    'Substring-search saved memories by name/description/body. Returns up to all matches.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text query. Empty = list all.' },
    },
    additionalProperties: false,
  },
  handler: searchHandler,
};

export const memoryListTool: RegisteredTool = {
  name: 'memory_list',
  description: 'List every saved memory (id, type, name, description) for the current project.',
  planModeAllowed: true,
  mutates: false,
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: listHandler,
};

export const memoryDeleteTool: RegisteredTool = {
  name: 'memory_delete',
  description: 'Delete a saved memory by id (the slug, not the display name).',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  handler: deleteHandler,
};
