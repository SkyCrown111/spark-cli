/**
 * Hook runner.
 *
 * Dispatches hooks by handler type:
 * - command/script: synchronous spawn via spawnSync (legacy)
 * - http: async POST to URL
 * - prompt: async LLM call from template
 *
 * For blocking events (`pre_tool`, `before_apply`), a non-zero exit blocks the
 * action with stderr as the reason. Advisory events log failures and move on.
 *
 * The `decision` field in HookRunResult allows hooks to explicitly
 * allow/deny/defer tool calls, threading through to the permission system.
 */

import { spawnSync } from 'node:child_process';
import { BLOCKING_EVENTS } from './events.js';
import type { HookEvent, HookPayload } from './events.js';
import {
  loadHookConfig,
  selectHooks,
  type HookConfig,
  type HookEntry,
} from './config.js';
import { appendReplayEvent } from '../replay/log.js';

export type HookDecision = 'allow' | 'deny' | 'ask' | 'defer';

export interface HookRunResult {
  /** True only if a blocking hook denied the action. */
  blocked: boolean;
  /** Aggregated reason from any blocking hooks. */
  reason?: string;
  /** All hook executions in order. */
  results: SingleHookResult[];
  /** Explicit decision from hooks (allow/deny/ask/defer). Undefined if no decision was made. */
  decision?: HookDecision;
  /** Additional context string from hooks (passed to the user or agent). */
  additionalContext?: string;
}

export interface SingleHookResult {
  label: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  /** True when timeout fired before the script exited. */
  timedOut: boolean;
  /** Stdout output from the hook (captured for additionalContext). */
  stdout?: string;
}

export interface RunHooksOptions {
  /** Pre-loaded config. If omitted, reads from project root each call. */
  config?: HookConfig;
  /** Tool name for tool-bound hooks. */
  tool?: string;
  /** Completion function for prompt-type hooks. */
  completeFn?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
}

const DEFAULT_TIMEOUT_MS = 10000;

export function runHooks(
  event: HookEvent,
  payload: HookPayload,
  projectRoot: string,
  opts: RunHooksOptions = {},
): HookRunResult {
  const cfg = opts.config ?? loadHookConfig(projectRoot);
  const matched = selectHooks(cfg, event, opts.tool);
  const isBlockingEvent = BLOCKING_EVENTS.has(event);

  const results: SingleHookResult[] = [];
  let blocked = false;
  const reasons: string[] = [];
  let decision: HookDecision | undefined;
  const contextParts: string[] = [];

  for (const entry of matched) {
    const r = executeHook(entry, payload, isBlockingEvent, opts.completeFn);
    results.push(r);
    const blockingNow = entry.blocking ?? isBlockingEvent;
    const didBlock =
      blockingNow && (r.status !== 0 || r.signal || r.timedOut);
    appendReplayEvent(projectRoot, 'hook_fired', {
      event,
      label: r.label,
      status: r.status,
      signal: r.signal,
      timedOut: r.timedOut,
      blocking: blockingNow,
      blocked: didBlock,
      tool: opts.tool,
      handler: entry.handler,
    });
    if (didBlock) {
      blocked = true;
      const reason = r.timedOut
        ? `${r.label} timed out`
        : r.stderr.trim() || `${r.label} exited with status ${r.status ?? 'signal'}`;
      reasons.push(reason);
    }
    // Parse decision from stdout (JSON or plain text)
    if (r.stdout) {
      const parsed = parseHookDecision(r.stdout);
      if (parsed.decision) decision = parsed.decision;
      if (parsed.context) contextParts.push(parsed.context);
    }
  }

  return {
    blocked,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    results,
    decision,
    additionalContext: contextParts.length > 0 ? contextParts.join('\n') : undefined,
  };
}

/** Parse decision from hook stdout. Expects JSON with {decision, context} or plain text. */
function parseHookDecision(stdout: string): {
  decision?: HookDecision;
  context?: string;
} {
  const trimmed = stdout.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const d = parsed.decision;
      if (d === 'allow' || d === 'deny' || d === 'ask' || d === 'defer') {
        return {
          decision: d,
          context: typeof parsed.context === 'string' ? parsed.context : undefined,
        };
      }
    }
  } catch {
    // Not JSON — check for plain-text decision keywords
    const lower = trimmed.toLowerCase();
    if (lower === 'allow' || lower === 'deny' || lower === 'ask' || lower === 'defer') {
      return { decision: lower as HookDecision };
    }
  }
  // If not a decision, treat as additional context
  return { context: trimmed };
}

function executeHook(
  entry: HookEntry,
  payload: HookPayload,
  blockingEvent: boolean,
  completeFn?: (messages: Array<{ role: string; content: string }>) => Promise<string>,
): SingleHookResult {
  const handler = entry.handler ?? 'command';

  // Dispatch by handler type
  switch (handler) {
    case 'http':
      return executeHttpHookSync(entry, payload);
    case 'prompt':
      return executePromptHookSync(entry, payload, completeFn);
    case 'command':
    case 'script':
    default:
      return executeCommandHook(entry, payload, blockingEvent);
  }
}

/** Synchronous wrapper for HTTP hooks (blocks until response). */
function executeHttpHookSync(
  entry: HookEntry,
  payload: HookPayload,
): SingleHookResult {
  const label = entry.label ?? entry.url ?? entry.event;
  // HTTP hooks are async but we run them synchronously via spawnSync-style blocking.
  // For the synchronous runner, we use a child process approach or just do it inline.
  // Since we can't await in sync context, we fall back to command/script if no URL.
  if (!entry.url) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: 'HTTP hook missing url',
      timedOut: false,
    };
  }

  // Use synchronous HTTP via a helper script spawned as a child process.
  // For simplicity, we'll use the async version in a blocking way.
  // In practice, HTTP hooks should use the async runner.
  const timeoutMs = entry.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    // Use node's built-in fetch via a synchronous wrapper
    const result = syncFetch(entry.url, payload, timeoutMs);
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    return {
      label,
      status: result.status,
      signal: null,
      stderr: result.stderr,
      timedOut: result.timedOut,
      stdout: result.stdout,
    };
  } catch (e) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: e instanceof Error ? e.message : String(e),
      timedOut: false,
    };
  }
}

/** Synchronous fetch using child_process. */
function syncFetch(
  url: string,
  payload: unknown,
  timeoutMs: number,
): { status: number; stdout: string; stderr: string; timedOut: boolean } {
  const script = `
    const data = JSON.stringify(${JSON.stringify(payload)});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ${timeoutMs});
    fetch(${JSON.stringify(url)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      signal: controller.signal,
    })
    .then(async res => {
      clearTimeout(timer);
      const body = await res.text();
      if (!res.ok) {
        process.stderr.write(body || 'HTTP ' + res.status);
        process.exit(1);
      }
      process.stdout.write(body);
      process.exit(0);
    })
    .catch(e => {
      clearTimeout(timer);
      process.stderr.write(e.name === 'AbortError' ? 'timed out' : e.message);
      process.exit(1);
    });
  `;
  const res = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: timeoutMs + 1000,
  });
  const timedOut =
    res.error !== undefined &&
    typeof res.error === 'object' &&
    res.error !== null &&
    'code' in (res.error as unknown as Record<string, unknown>) &&
    (res.error as unknown as { code?: string }).code === 'ETIMEDOUT';
  return {
    status: res.status ?? 1,
    stdout: (res.stdout ?? '').toString(),
    stderr: (res.stderr ?? '').toString(),
    timedOut,
  };
}

/** Synchronous wrapper for prompt hooks. */
function executePromptHookSync(
  entry: HookEntry,
  _payload: HookPayload,
  completeFn?: (messages: Array<{ role: string; content: string }>) => Promise<string>,
): SingleHookResult {
  const label = entry.label ?? 'prompt-hook';
  if (!entry.prompt_template) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: 'Prompt hook missing prompt_template',
      timedOut: false,
    };
  }
  if (!completeFn) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: 'No completion function provided for prompt hook',
      timedOut: false,
    };
  }

  // Prompt hooks require async execution (LLM call).
  // The synchronous runner returns an advisory message; use runHooksAsync for proper execution.
  return {
    label,
    status: 1,
    signal: null,
    stderr: 'Prompt hooks require async runner (runHooksAsync)',
    timedOut: false,
  };
}

function executeCommandHook(
  entry: HookEntry,
  payload: HookPayload,
  blockingEvent: boolean,
): SingleHookResult {
  const label = entry.label ?? entry.command ?? entry.script?.path ?? entry.event;
  const timeoutMs = entry.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdinPayload = JSON.stringify(payload);

  let res;
  try {
    if (entry.script) {
      res = spawnSync(entry.script.interpreter, [entry.script.path], {
        input: stdinPayload,
        encoding: 'utf8',
        timeout: timeoutMs,
      });
    } else if (entry.command) {
      res = spawnSync(entry.command, {
        input: stdinPayload,
        encoding: 'utf8',
        timeout: timeoutMs,
        shell: true,
      });
    } else {
      return {
        label,
        status: 1,
        signal: null,
        stderr: 'hook entry has no command or script',
        timedOut: false,
      };
    }
  } catch (e) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: e instanceof Error ? e.message : String(e),
      timedOut: false,
    };
  }

  const timedOut =
    res.error !== undefined &&
    typeof res.error === 'object' &&
    res.error !== null &&
    'code' in (res.error as unknown as Record<string, unknown>) &&
    (res.error as unknown as { code?: string }).code === 'ETIMEDOUT';

  // Pass advisory stdout through; stay quiet for blocking-event success.
  const stdoutText = (res.stdout ?? '').toString();
  if (stdoutText && !blockingEvent) {
    process.stdout.write(stdoutText);
  } else if (stdoutText && blockingEvent && (res.status ?? 0) !== 0) {
    process.stdout.write(stdoutText);
  }

  return {
    label,
    status: res.status,
    signal: res.signal,
    stderr: (res.stderr ?? '').toString(),
    timedOut,
    stdout: stdoutText || undefined,
  };
}
