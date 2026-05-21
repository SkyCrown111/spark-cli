/**
 * Async hook runner.
 *
 * Runs hooks in the background without blocking the caller.
 * Used for advisory hooks that don't need to influence tool decisions.
 */

import type { HookEvent, HookPayload } from './events.js';
import type { HookConfig } from './config.js';
import { runHooks, type HookRunResult } from './runner.js';

export interface AsyncHookOptions {
  config?: HookConfig;
  tool?: string;
  /** Optional callback when async hooks complete. */
  onComplete?: (result: HookRunResult) => void;
  /** Optional callback on error. */
  onError?: (error: Error) => void;
}

/**
 * Run hooks asynchronously in the background.
 * Returns immediately; the caller does not await the result.
 */
export function runHooksAsync(
  event: HookEvent,
  payload: HookPayload,
  projectRoot: string,
  opts: AsyncHookOptions = {},
): void {
  // Fire and forget — errors are caught and logged
  Promise.resolve()
    .then(() => {
      const result = runHooks(event, payload, projectRoot, {
        config: opts.config,
        tool: opts.tool,
      });
      opts.onComplete?.(result);
    })
    .catch((e) => {
      const err = e instanceof Error ? e : new Error(String(e));
      opts.onError?.(err);
    });
}

/**
 * Run hooks with a timeout. Returns a promise that resolves
 * with the result or rejects on timeout.
 */
export async function runHooksWithTimeout(
  event: HookEvent,
  payload: HookPayload,
  projectRoot: string,
  timeoutMs: number,
  opts: AsyncHookOptions = {},
): Promise<HookRunResult> {
  return new Promise<HookRunResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Hooks for ${event} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = runHooks(event, payload, projectRoot, {
        config: opts.config,
        tool: opts.tool,
      });
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
