/**
 * Node cache for Ink renderer — caches previously rendered nodes
 * to avoid re-computing their output on every frame.
 *
 * Uses a simple Map keyed by node identity. When React reconciliation
 * indicates a node hasn't changed, we can reuse its cached output.
 */

export interface NodeCacheEntry {
  /** The rendered output string for this node */
  output: string;
  /** Hash/fingerprint for detecting changes */
  fingerprint: string;
  /** Timestamp of last render */
  lastRender: number;
}

const MAX_CACHE_SIZE = 500;

/**
 * Simple LRU-like node cache.
 */
export class NodeCache {
  private cache = new Map<string, NodeCacheEntry>();
  private maxSize: number;

  constructor(maxSize = MAX_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Get a cached entry by key.
   */
  get(key: string): NodeCacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (LRU refresh)
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  /**
   * Store an entry in the cache.
   */
  set(key: string, entry: NodeCacheEntry): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, entry);
  }

  /**
   * Check if a cached entry matches a given fingerprint.
   */
  isDirty(key: string, fingerprint: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return true;
    return cached.fingerprint !== fingerprint;
  }

  /**
   * Clear the entire cache (e.g., after terminal resize).
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size.
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Default global node cache instance.
 */
export const globalNodeCache = new NodeCache();
