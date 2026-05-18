/**
 * Lazy per-provider capability cache.
 *
 * - Capabilities are resolved per `(providerId, baseUrl, model)` triple.
 * - First call returns optimistic defaults (`tools: true`) unless overridden by
 *   `provider.toolsMode === 'fallback'`.
 * - Providers self-demote when a tool-related 4xx is observed; the cache flips
 *   to `tools: false` for the rest of the session, so subsequent calls skip
 *   sending `tools` and the agent surfaces the gateway error to the user.
 *
 * The cache is process-local on purpose. It is meant to absorb the cost of one
 * unsupported request per legacy gateway, not to be a persistent registry.
 */

import type { ProviderCapabilities, ToolsMode } from './types.js';

interface CapabilityKey {
  providerId: string;
  baseUrl: string;
  model: string;
}

function keyOf(k: CapabilityKey): string {
  return `${k.providerId}::${k.baseUrl}::${k.model}`;
}

const cache = new Map<string, ProviderCapabilities>();

export function getCapabilities(
  k: CapabilityKey,
  toolsMode: ToolsMode = 'auto',
): ProviderCapabilities {
  const cached = cache.get(keyOf(k));
  if (cached) return cached;

  // Native: trust the user; surface errors. Fallback: never send tools.
  // Auto: optimistic, demote on first failure.
  const initial: ProviderCapabilities = {
    tools: toolsMode !== 'fallback',
  };
  cache.set(keyOf(k), initial);
  return initial;
}

/** Mark a provider as not supporting tools for the rest of the session. */
export function demoteTools(k: CapabilityKey, reason?: string): void {
  cache.set(keyOf(k), { tools: false });
  if (reason && process.env.SPARK_CLI_DEBUG_CAPS) {
    console.warn(`[spark-cli] tools demoted for ${keyOf(k)}: ${reason}`);
  }
}

/**
 * Heuristic: does this 4xx body look like the gateway is rejecting `tools`?
 * Used to decide whether a 4xx should trigger demotion (auto mode) vs surface
 * to the user (native mode).
 */
export function isToolRelated4xx(status: number, body: string): boolean {
  if (status < 400 || status >= 500) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes('tool') ||
    lower.includes('function call') ||
    lower.includes('functions') ||
    lower.includes('tool_choice') ||
    lower.includes('tool_calls')
  );
}

/** Test-only: clear the cache between unit tests. */
export function _resetCapabilitiesForTests(): void {
  cache.clear();
}
