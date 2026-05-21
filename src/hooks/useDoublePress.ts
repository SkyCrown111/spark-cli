/**
 * useDoublePress — detects double-press of a key within a time window.
 *
 * Used for features like:
 * - Double-press Esc to exit/cancel (cc-haha pattern)
 * - Double-press a key for a special action
 *
 * Usage:
 * ```tsx
 * const { onPress, isWaiting } = useDoublePress({
 *   onDoublePress: () => { handle double press },
 *   interval: 300, // ms window for second press
 * });
 *
 * // In your input handler:
 * if (key.escape) {
 *   onPress(); // Returns true if this was the second press
 * }
 * ```
 */

import { useRef, useCallback, useState } from 'react';

// ── Types ──────────────────────────────────────────────

export interface UseDoublePressOptions {
  /** Callback when the key is double-pressed */
  onDoublePress: () => void;
  /** Time window in ms for the second press (default: 300) */
  interval?: number;
}

export interface UseDoublePressReturn {
  /**
   * Call this on each key press.
   * Returns true if this was the second press (double-press detected).
   */
  onPress: () => boolean;
  /** Whether we're waiting for the second press */
  isWaiting: boolean;
  /** Cancel the waiting state */
  cancel: () => void;
}

// ── Hook ───────────────────────────────────────────────

/**
 * useDoublePress — detects double-press of a key.
 */
export function useDoublePress(options: UseDoublePressOptions): UseDoublePressReturn {
  const { onDoublePress, interval = 300 } = options;
  const [isWaiting, setIsWaiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoublePressRef = useRef(onDoublePress);
  onDoublePressRef.current = onDoublePress;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsWaiting(false);
  }, []);

  const onPress = useCallback((): boolean => {
    if (isWaiting) {
      // This is the second press — double-press detected
      cancel();
      onDoublePressRef.current();
      return true;
    }

    // First press — start waiting
    setIsWaiting(true);
    timerRef.current = setTimeout(() => {
      setIsWaiting(false);
      timerRef.current = null;
    }, interval);

    return false;
  }, [isWaiting, interval, cancel]);

  return {
    onPress,
    isWaiting,
    cancel,
  };
}
