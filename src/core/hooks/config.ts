/**
 * Hook configuration loader.
 *
 * Reads `<projectRoot>/.spark-cli/hooks/config.json`. Each entry binds an event
 * to either a shell `command` string OR a `script` (interpreter + path) form.
 * The `script` form is the cross-platform path (e.g. `node scripts/audit.js`),
 * while `command` is the convenient string form that the runner spawns under
 * `shell:true` on Windows for parity with `/bin/sh -c`.
 *
 * The loader is forgiving: missing file → empty list; malformed JSON →
 * surfaced through a thrown `SparkCLIError`. Individual entries that fail
 * schema validation are dropped and warned.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HookEvent } from './events.js';
import { SparkCLIError } from '../../utils/errors.js';

export type HookHandlerType = 'command' | 'script' | 'http' | 'prompt';

export interface HookEntry {
  event: HookEvent;
  /** Optional restriction to specific tool names (only meaningful for tool events). */
  tools?: string[];
  /** Handler type. Inferred from fields if omitted: command/script/http/prompt. */
  handler?: HookHandlerType;
  /** Convenience form: passes through shell:true on Windows. */
  command?: string;
  /** Cross-platform form: explicit interpreter + path. */
  script?: { interpreter: string; path: string };
  /** HTTP handler: URL to POST JSON payload to. */
  url?: string;
  /** Prompt handler: template string with {{field}} placeholders. */
  prompt_template?: string;
  /** Glob/regex pattern to match tool names or file paths against. */
  matcher?: string;
  /** Execution priority (lower runs first). Default 0. */
  priority?: number;
  /** Default 10000 ms. */
  timeoutMs?: number;
  /** Default true for blocking events; false for advisory. */
  blocking?: boolean;
  /** Optional friendly label for log output. */
  label?: string;
}

export interface HookConfig {
  hooks: HookEntry[];
}

const VALID_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
  'session_start',
  'session_end',
  'pre_user_message',
  'post_assistant_message',
  'pre_tool',
  'post_tool',
  'before_apply',
  'on_skill_load',
  'on_compaction',
  'on_subagent_spawn',
  'on_plan_enter',
  'on_plan_exit',
  'permission_request',
  'permission_denied',
  'stop',
  'stop_failure',
  'task_created',
  'task_completed',
  'pre_compact',
  'post_compact',
  'file_changed',
]);

function configPath(projectRoot: string): string {
  return join(projectRoot, '.spark-cli', 'hooks', 'config.json');
}

export function loadHookConfig(projectRoot: string): HookConfig {
  const path = configPath(projectRoot);
  if (!existsSync(path)) return { hooks: [] };

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    throw new SparkCLIError(
      `Failed to read hook config at ${path}: ${e instanceof Error ? e.message : String(e)}`,
      1,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SparkCLIError(
      `Hook config is not valid JSON at ${path}: ${e instanceof Error ? e.message : String(e)}`,
      1,
    );
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as HookConfig).hooks)) {
    return { hooks: [] };
  }

  const hooks: HookEntry[] = [];
  for (const entry of (parsed as HookConfig).hooks) {
    const norm = normalizeEntry(entry);
    if (norm) hooks.push(norm);
  }
  return { hooks };
}

function inferHandlerType(e: Partial<HookEntry>): HookHandlerType | undefined {
  if (e.handler) return e.handler;
  if (e.command) return 'command';
  if (e.script) return 'script';
  if (e.url) return 'http';
  if (e.prompt_template) return 'prompt';
  return undefined;
}

function normalizeEntry(entry: unknown): HookEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Partial<HookEntry>;
  if (!e.event || !VALID_EVENTS.has(e.event)) return null;

  const handler = inferHandlerType(e);
  if (!handler) return null;

  // Validate handler-specific fields
  if (handler === 'script') {
    if (
      typeof e.script?.interpreter !== 'string' ||
      typeof e.script?.path !== 'string'
    ) {
      return null;
    }
  }
  if (handler === 'http' && typeof e.url !== 'string') return null;
  if (handler === 'prompt' && typeof e.prompt_template !== 'string') return null;
  if (handler === 'command' && typeof e.command !== 'string') return null;

  if (e.tools !== undefined) {
    if (!Array.isArray(e.tools) || !e.tools.every((t) => typeof t === 'string')) {
      return null;
    }
  }
  return {
    event: e.event,
    tools: e.tools,
    handler,
    command: typeof e.command === 'string' ? e.command : undefined,
    script: e.script,
    url: typeof e.url === 'string' ? e.url : undefined,
    prompt_template: typeof e.prompt_template === 'string' ? e.prompt_template : undefined,
    matcher: typeof e.matcher === 'string' ? e.matcher : undefined,
    priority: typeof e.priority === 'number' ? e.priority : undefined,
    timeoutMs: typeof e.timeoutMs === 'number' ? e.timeoutMs : undefined,
    blocking: typeof e.blocking === 'boolean' ? e.blocking : undefined,
    label: typeof e.label === 'string' ? e.label : undefined,
  };
}

/** Filter hooks for a given event (and optional tool-name match). */
export function selectHooks(
  cfg: HookConfig,
  event: HookEvent,
  tool?: string,
): HookEntry[] {
  return cfg.hooks
    .filter((h) => {
      if (h.event !== event) return false;
      if (h.tools && h.tools.length > 0 && tool) {
        return h.tools.includes(tool);
      }
      if (h.tools && h.tools.length > 0 && !tool) {
        // Tool-restricted hook on non-tool event — skip.
        return false;
      }
      // Matcher filter: match against tool name or file path
      if (h.matcher && tool) {
        return matchesGlob(h.matcher, tool);
      }
      return true;
    })
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

/** Simple glob matcher supporting * and ** wildcards. */
export function matchesGlob(pattern: string, value: string): boolean {
  // Convert glob to regex: ** → .*, * → [^/]*
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  const re = new RegExp(`^${escaped}$`, 'i');
  return re.test(value);
}
