/**
 * useInputBuffer — buffers rapid keypresses and batches them.
 *
 * When keys arrive faster than React can process them (e.g., fast typing,
 * held keys), this hook accumulates them in a buffer and flushes them
 * at a regular interval. This prevents lost characters during rapid input
 * and ensures consistent state updates.
 *
 * cc-haha uses a similar approach with `useInputBuffer` to handle
 * fast typing scenarios where Ink's reconciliation might miss events.
 *
 * Usage:
 * ```tsx
 * const { buffer, flush, push } = useInputBuffer({
 *   onFlush: (items) => { process batched items },
 *   flushInterval: 16, // ~60fps
 * });
 * ```
 */

import { useRef, useCallback, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────

export interface BufferedInput {
  /** The input character */
  char: string;
  /** The key object from Ink's useInput */
  key: Record<string, boolean>;
  /** Timestamp when the input was received */
  timestamp: number;
}

export interface UseInputBufferOptions {
  /** Callback when the buffer is flushed */
  onFlush?: (items: BufferedInput[]) => void;
  /** Flush interval in ms (default: 16, ~60fps) */
  flushInterval?: number;
  /** Maximum buffer size before forcing a flush (default: 20) */
  maxBufferSize?: number;
}

export interface UseInputBufferReturn {
  /** Push an input into the buffer */
  push: (char: string, key: Record<string, boolean>) => void;
  /** Manually flush the buffer */
  flush: () => void;
  /** Clear the buffer without processing */
  clear: () => void;
  /** Current buffer size */
  size: number;
}

// ── Hook ───────────────────────────────────────────────

/**
 * useInputBuffer — buffers rapid keypresses and batches them.
 */
export function useInputBuffer(options: UseInputBufferOptions = {}): UseInputBufferReturn {
  const { onFlush, flushInterval = 16, maxBufferSize = 20 } = options;
  const bufferRef = useRef<BufferedInput[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sizeRef = useRef(0);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;

    const items = bufferRef.current;
    bufferRef.current = [];
    sizeRef.current = 0;

    onFlushRef.current?.(items);
  }, []);

  const push = useCallback(
    (char: string, key: Record<string, boolean>) => {
      bufferRef.current.push({
        char,
        key,
        timestamp: Date.now(),
      });
      sizeRef.current = bufferRef.current.length;

      // Force flush if buffer is full
      if (bufferRef.current.length >= maxBufferSize) {
        flush();
      }
    },
    [maxBufferSize, flush],
  );

  const clear = useCallback(() => {
    bufferRef.current = [];
    sizeRef.current = 0;
  }, []);

  // Set up flush timer
  useEffect(() => {
    timerRef.current = setInterval(flush, flushInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [flushInterval, flush]);

  return {
    push,
    flush,
    clear,
    size: sizeRef.current,
  };
}
