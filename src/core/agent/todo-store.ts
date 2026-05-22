/**
 * Per-session todo list shared across `todo_create`, `todo_list`, `todo_get`,
 * and `todo_update`. Lives in memory only — when the agent loop exits the
 * todo list disappears with it.
 *
 * Concurrency: the agent loop drives tool calls serially per turn (parallel
 * dispatch only fires for read-only tools, and todos are write-mostly), so a
 * naive Map keyed by integer ID is safe enough.
 */
import { randomUUID } from 'node:crypto';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface Todo {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: TodoStatus;
  createdAt: number;
  updatedAt: number;
  blocks: string[];
  blockedBy: string[];
  metadata: Record<string, unknown>;
}

export interface TodoSummary {
  id: string;
  subject: string;
  status: TodoStatus;
  blockedBy: string[];
}

export class TodoStore {
  private items = new Map<string, Todo>();
  private listeners: Array<() => void> = [];

  /** Subscribe to store changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  create(input: {
    subject: string;
    description: string;
    activeForm?: string;
    metadata?: Record<string, unknown>;
  }): Todo {
    const id = randomUUID().slice(0, 8);
    const now = Date.now();
    const todo: Todo = {
      id,
      subject: input.subject,
      description: input.description,
      activeForm: input.activeForm,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      blocks: [],
      blockedBy: [],
      metadata: input.metadata ? { ...input.metadata } : {},
    };
    this.items.set(id, todo);
    this.notify();
    return todo;
  }

  list(): TodoSummary[] {
    return Array.from(this.items.values()).map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      blockedBy: [...t.blockedBy],
    }));
  }

  get(id: string): Todo | null {
    const t = this.items.get(id);
    return t ? { ...t, blocks: [...t.blocks], blockedBy: [...t.blockedBy], metadata: { ...t.metadata } } : null;
  }

  update(
    id: string,
    patch: Partial<Pick<Todo, 'subject' | 'description' | 'activeForm' | 'status'>> & {
      addBlocks?: string[];
      addBlockedBy?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Todo | { error: string } {
    const t = this.items.get(id);
    if (!t) return { error: `no todo with id "${id}"` };
    if (patch.subject !== undefined) t.subject = patch.subject;
    if (patch.description !== undefined) t.description = patch.description;
    if (patch.activeForm !== undefined) t.activeForm = patch.activeForm;
    if (patch.status !== undefined) t.status = patch.status;
    if (patch.metadata) {
      for (const [k, v] of Object.entries(patch.metadata)) {
        if (v === null) delete t.metadata[k];
        else t.metadata[k] = v;
      }
    }
    if (patch.addBlocks) {
      for (const other of patch.addBlocks) {
        if (other === id) continue;
        if (!t.blocks.includes(other)) t.blocks.push(other);
        const o = this.items.get(other);
        if (o && !o.blockedBy.includes(id)) o.blockedBy.push(id);
      }
    }
    if (patch.addBlockedBy) {
      for (const other of patch.addBlockedBy) {
        if (other === id) continue;
        if (!t.blockedBy.includes(other)) t.blockedBy.push(other);
        const o = this.items.get(other);
        if (o && !o.blocks.includes(id)) o.blocks.push(id);
      }
    }
    t.updatedAt = Date.now();
    this.notify();
    return { ...t, blocks: [...t.blocks], blockedBy: [...t.blockedBy], metadata: { ...t.metadata } };
  }

  delete(id: string): boolean {
    const t = this.items.get(id);
    if (!t) return false;
    // Detach from neighbours so dangling refs don't surface in list output.
    for (const otherId of t.blocks) {
      const o = this.items.get(otherId);
      if (o) o.blockedBy = o.blockedBy.filter((x) => x !== id);
    }
    for (const otherId of t.blockedBy) {
      const o = this.items.get(otherId);
      if (o) o.blocks = o.blocks.filter((x) => x !== id);
    }
    const result = this.items.delete(id);
    this.notify();
    return result;
  }

  clear(): void {
    this.items.clear();
    this.notify();
  }
}

let singleton: TodoStore | null = null;

export function getTodoStore(): TodoStore {
  if (!singleton) singleton = new TodoStore();
  return singleton;
}

/** Test-only reset. */
export function _resetTodoStoreForTests(): void {
  singleton?.clear();
  singleton = null;
}
