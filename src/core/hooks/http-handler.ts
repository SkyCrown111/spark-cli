/**
 * HTTP hook handler.
 *
 * POSTs the hook payload as JSON to the configured URL.
 * Returns the response body as a HookRunResult.
 */

import type { SingleHookResult } from './runner.js';

const DEFAULT_HTTP_TIMEOUT_MS = 10000;

export interface HttpHandlerOptions {
  url: string;
  payload: unknown;
  timeoutMs?: number;
  label?: string;
}

export async function executeHttpHook(
  opts: HttpHandlerOptions,
): Promise<SingleHookResult> {
  const label = opts.label ?? opts.url;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts.payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const body = await res.text();

    if (!res.ok) {
      return {
        label,
        status: res.status,
        signal: null,
        stderr: body || `HTTP ${res.status}`,
        timedOut: false,
      };
    }

    // Pass successful response through stdout-like behavior
    if (body) {
      process.stdout.write(body);
    }

    return {
      label,
      status: 0,
      signal: null,
      stderr: '',
      timedOut: false,
    };
  } catch (e) {
    clearTimeout(timer);
    const isTimeout =
      e instanceof DOMException && e.name === 'AbortError';
    return {
      label,
      status: 1,
      signal: null,
      stderr: isTimeout
        ? `${label} timed out after ${timeoutMs}ms`
        : e instanceof Error
          ? e.message
          : String(e),
      timedOut: isTimeout,
    };
  }
}
