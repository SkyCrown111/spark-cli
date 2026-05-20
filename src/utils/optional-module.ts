/**
 * Dynamic import helper for optional dependencies.
 * Missing packages return `{ ok: false, reason }` instead of crashing startup.
 */

import { createRequire } from 'node:module';

const requireOptional = createRequire(import.meta.url);

export interface OptionalLoadOk<T> {
  ok: true;
  module: T;
}

export interface OptionalLoadFail {
  ok: false;
  reason: string;
}

export type OptionalLoadResult<T> = OptionalLoadOk<T> | OptionalLoadFail;

/** Probe whether a package can be imported (async; does not cache). */
export async function tryImportOptional<T = unknown>(
  specifier: string,
): Promise<OptionalLoadResult<T>> {
  try {
    const module = (await import(specifier)) as T;
    return { ok: true, module };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Cannot find module|ERR_MODULE_NOT_FOUND|not installed/i.test(msg)) {
      return { ok: false, reason: `optional package not installed: ${specifier}` };
    }
    return { ok: false, reason: `failed to load ${specifier}: ${msg}` };
  }
}

/** Synchronous probe via createRequire (for doctor snapshots). */
export function probeOptionalRequire(specifier: string): OptionalLoadResult<unknown> {
  try {
    const module = requireOptional(specifier);
    return { ok: true, module };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Cannot find module|MODULE_NOT_FOUND/i.test(msg)) {
      return { ok: false, reason: `optional package not installed: ${specifier}` };
    }
    return { ok: false, reason: `failed to load ${specifier}: ${msg}` };
  }
}
