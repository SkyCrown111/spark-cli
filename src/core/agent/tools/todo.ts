/**
 * todo_*: per-session task list for the agent.
 *
 * The store is in-memory only and survives across tool calls within a single
 * agent loop run. Use this when a request decomposes into ≥3 distinct steps,
 * to give the user visibility into progress and to keep the agent from losing
 * track of subtasks. For shorter requests, just do the work.
 *
 * Tool surface:
 * - todo_create: register a new pending item.
 * - todo_list: enumerate all items with status + blockedBy.
 * - todo_get: full details (description, dependency edges, metadata).
 * - todo_update: change status / fields, add dependency edges, or delete.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { getTodoStore, type Todo, type TodoStatus } from '../todo-store.js';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string');
}

function todoLine(t: Pick<Todo, 'id' | 'subject' | 'status' | 'blockedBy'>): string {
  const blocked = t.blockedBy.length > 0 ? ` blockedBy=${t.blockedBy.join(',')}` : '';
  return `  [${t.status}] ${t.id} ${t.subject}${blocked}`;
}

async function createHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const subject = asString(args.subject);
  const description = asString(args.description);
  if (!subject || subject.trim().length === 0) {
    return { content: 'todo_create: `subject` must be a non-empty string', isError: true };
  }
  if (!description) {
    return { content: 'todo_create: `description` must be a string', isError: true };
  }
  const activeForm = asString(args.activeForm);
  const metadata =
    args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
      ? (args.metadata as Record<string, unknown>)
      : undefined;

  const todo = getTodoStore().create({ subject, description, activeForm, metadata });
  return {
    content: `Created todo ${todo.id}: ${todo.subject}`,
    structured: { id: todo.id, status: todo.status },
  };
}

async function listHandler(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const items = getTodoStore().list();
  if (items.length === 0) {
    return { content: '(no todos)', structured: { items: [] } };
  }
  const lines = ['Todos:', ...items.map(todoLine)];
  return { content: lines.join('\n'), structured: { items } };
}

async function getHandler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const id = asString(args.id);
  if (!id) return { content: 'todo_get: `id` must be a string', isError: true };
  const t = getTodoStore().get(id);
  if (!t) return { content: `todo_get: no todo with id "${id}"`, isError: true };
  const lines = [
    `id: ${t.id}`,
    `subject: ${t.subject}`,
    `status: ${t.status}`,
    `description: ${t.description}`,
  ];
  if (t.activeForm) lines.push(`activeForm: ${t.activeForm}`);
  if (t.blocks.length > 0) lines.push(`blocks: ${t.blocks.join(', ')}`);
  if (t.blockedBy.length > 0) lines.push(`blockedBy: ${t.blockedBy.join(', ')}`);
  if (Object.keys(t.metadata).length > 0) {
    lines.push(`metadata: ${JSON.stringify(t.metadata)}`);
  }
  return { content: lines.join('\n'), structured: { ...t } };
}

async function updateHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const id = asString(args.id);
  if (!id) return { content: 'todo_update: `id` must be a string', isError: true };

  const status = asString(args.status);
  if (status === 'deleted') {
    const ok = getTodoStore().delete(id);
    if (!ok) return { content: `todo_update: no todo with id "${id}"`, isError: true };
    return { content: `Deleted todo ${id}`, structured: { id, deleted: true } };
  }

  const validStatuses: readonly TodoStatus[] = ['pending', 'in_progress', 'completed'];
  if (status !== undefined && !validStatuses.includes(status as TodoStatus)) {
    return {
      content: `todo_update: invalid status "${status}". Use pending | in_progress | completed | deleted.`,
      isError: true,
    };
  }

  const result = getTodoStore().update(id, {
    subject: asString(args.subject),
    description: asString(args.description),
    activeForm: asString(args.activeForm),
    status: status as TodoStatus | undefined,
    addBlocks: asStringArray(args.addBlocks),
    addBlockedBy: asStringArray(args.addBlockedBy),
    metadata:
      args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
        ? (args.metadata as Record<string, unknown>)
        : undefined,
  });
  if ('error' in result) return { content: `todo_update: ${result.error}`, isError: true };

  return {
    content: `Updated todo ${result.id} (status=${result.status})`,
    structured: { id: result.id, status: result.status },
  };
}

export const todoCreateTool: RegisteredTool = {
  name: 'todo_create',
  description:
    'Create a new pending todo for the current session. Use when a request decomposes into 3+ steps so the user can track progress. Returns the new todo ID.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Brief actionable title (imperative form).' },
      description: { type: 'string', description: 'What needs to be done.' },
      activeForm: {
        type: 'string',
        description:
          'Optional present-continuous form shown while in_progress (e.g. "Running tests").',
      },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['subject', 'description'],
    additionalProperties: false,
  },
  handler: createHandler,
};

export const todoListTool: RegisteredTool = {
  name: 'todo_list',
  description: 'List every todo in the current session with status and blockedBy edges.',
  planModeAllowed: true,
  mutates: false,
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: listHandler,
};

export const todoGetTool: RegisteredTool = {
  name: 'todo_get',
  description: 'Fetch full details (description, edges, metadata) for a single todo by ID.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  handler: getHandler,
};

export const todoUpdateTool: RegisteredTool = {
  name: 'todo_update',
  description:
    'Update a todo: change status (pending/in_progress/completed), edit fields, add dependency edges, or delete with status="deleted". Mark in_progress when starting and completed when fully done.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      subject: { type: 'string' },
      description: { type: 'string' },
      activeForm: { type: 'string' },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'deleted'],
      },
      addBlocks: { type: 'array', items: { type: 'string' } },
      addBlockedBy: { type: 'array', items: { type: 'string' } },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler: updateHandler,
};
