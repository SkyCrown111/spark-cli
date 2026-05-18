/**
 * Hook runner.
 *
 * Each hook spawns synchronously via `spawnSync`, JSON payload on stdin.
 * Stdout passes through to the user's terminal; stderr is captured. For
 * blocking events (`pre_tool`, `before_apply`), a non-zero exit blocks the
 * action with stderr as the reason. Advisory events log failures and move on.
 *
 * Windows portability: `command` form uses `shell:true`. The `script` form
 * spawns the interpreter directly; it's the path the user picks when they
 * want a script that runs the same on macOS/Linux and Windows.
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

export interface HookRunResult {
  /** True only if a blocking hook denied the action. */
  blocked: boolean;
  /** Aggregated reason from any blocking hooks. */
  reason?: string;
  /** All hook executions in order. */
  results: SingleHookResult[];
}

export interface SingleHookResult {
  label: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  /** True when timeout fired before the script exited. */
  timedOut: boolean;
}

export interface RunHooksOptions {
  /** Pre-loaded config. If omitted, reads from project root each call. */
  config?: HookConfig;
  /** Tool name for tool-bound hooks. */
  tool?: string;
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

  for (const entry of matched) {
    const r = executeHook(entry, payload, isBlockingEvent);
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
    });
    if (didBlock) {
      blocked = true;
      const reason = r.timedOut
        ? `${r.label} timed out`
        : r.stderr.trim() || `${r.label} exited with status ${r.status ?? 'signal'}`;
      reasons.push(reason);
    }
  }

  return {
    blocked,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    results,
  };
}

function executeHook(
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
  };
}
