import { isMcpWriteToolName } from './permissions.js';

export const SENSITIVE_TOOL_NAMES = new Set([
  'bash',
  'bash_background',
  'task_stop',
  'write_file',
  'edit_file',
  'scene_add_node',
  'component_update',
  'stage_project_file',
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

export class ToolPermissionSession {
  private alwaysAllow = new Set<string>();

  allowAlways(tool: string): void {
    this.alwaysAllow.add(tool);
  }

  isAlwaysAllowed(tool: string): boolean {
    return this.alwaysAllow.has(tool);
  }

  reset(): void {
    this.alwaysAllow.clear();
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
