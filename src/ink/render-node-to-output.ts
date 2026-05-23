/**
 * Render a single node to output string.
 * Helper for the optimizer's line-by-line diff computation.
 */

import type { NodeCacheEntry } from './node-cache.js';

/**
 * Compute a simple fingerprint for a string of text content.
 * Used to quickly detect whether a node's output has changed.
 */
export function computeFingerprint(text: string): string {
  // Simple hash: length + first 8 chars + last 8 chars
  // Not cryptographically secure, just fast for change detection
  const len = text.length;
  const prefix = len > 16 ? text.slice(0, 8) : text;
  const suffix = len > 16 ? text.slice(-8) : '';
  return `${len}:${prefix}:${suffix}`;
}

/**
 * Create a cache entry from rendered output.
 */
export function createCacheEntry(output: string): NodeCacheEntry {
  return {
    output,
    fingerprint: computeFingerprint(output),
    lastRender: Date.now(),
  };
}
