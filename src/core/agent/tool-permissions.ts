import { isMcpWriteToolName } from './permissions.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SENSITIVE_TOOL_NAMES = new Set([
  'bash',
  'bash_background',
  'task_stop',
  'write_file',
  'edit_file',
]);

export function isSensitiveTool(name: string): boolean {
  return SENSITIVE_TOOL_NAMES.has(name) || isMcpWriteToolName(name);
}

export interface ToolConfirmRequest {
  tool: string;
  argsSummary: string;
}

export type ToolConfirmFn = (req: ToolConfirmRequest) => Promise<boolean>;

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

export interface AskUserRequest {
  questions: AskUserQuestion[];
}

export interface AskUserAnswer {
  question: string;
  selected: string[];
}

/**
 * Prompts the user with one or more multiple-choice questions and resolves with
 * their answers. Only available in the REPL — one-shot CLI returns the
 * sentinel `unsupported` so the tool can surface a helpful error.
 */
export type AskUserFn = (
  req: AskUserRequest,
) => Promise<{ answers: AskUserAnswer[] } | { unsupported: true; reason: string }>;

/**
 * Session-scoped tool permission tracker.
 *
 * When `persistDir` is provided, "always allow" choices are saved to
 * `always-allow.json` in that directory and reloaded on subsequent sessions.
 * When `persistDir` is undefined (or empty), behaves as before — in-memory only.
 */
export class ToolPermissionSession {
  private alwaysAllow = new Set<string>();
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
    if (persistPath) {
      this.loadPersisted();
    }
  }

  allowAlways(tool: string): void {
    this.alwaysAllow.add(tool);
    this.persist();
  }

  isAlwaysAllowed(tool: string): boolean {
    return this.alwaysAllow.has(tool);
  }

  reset(): void {
    this.alwaysAllow.clear();
    this.persist();
  }

  /** Return the set of always-allowed tools (for serialization). */
  getAlwaysAllowSet(): ReadonlySet<string> {
    return this.alwaysAllow;
  }

  private loadPersisted(): void {
    if (!this.persistPath) return;
    try {
      if (existsSync(this.persistPath)) {
        const data = JSON.parse(readFileSync(this.persistPath, 'utf8'));
        if (data && Array.isArray(data.tools)) {
          for (const t of data.tools as string[]) {
            this.alwaysAllow.add(t);
          }
        }
      }
    } catch {
      // Corrupt or missing file — start with empty set
    }
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      const dir = join(this.persistPath, '..');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(
        this.persistPath,
        JSON.stringify({ tools: Array.from(this.alwaysAllow) }, null, 2),
      );
    } catch {
      // Write failure — don't block the session
    }
  }
}

export function summarizeToolArgs(tool: string, args: Record<string, unknown>): string {
  if (tool === 'bash' && typeof args.command === 'string') {
    const c = args.command.replace(/\s+/g, ' ').trim();
    return c.length > 80 ? c.slice(0, 77) + '…' : c;
  }
  if (typeof args.path === 'string') {
    return args.path;
  }
  const keys = Object.keys(args);
  if (keys.length === 0) return '(no args)';
  return keys.slice(0, 3).join(', ');
}
