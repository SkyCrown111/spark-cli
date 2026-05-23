/**
 * useScrollBox — hook for ScrollBox state management.
 *
 * Provides a convenient way to create and manage a ScrollBox
 * from outside the component tree (e.g., for imperative control
 * from ink-repl.tsx).
 */

import { useRef, useCallback } from 'react';
import type { ScrollBoxHandle } from '../components/ScrollBox.js';

export interface UseScrollBoxReturn {
  /** Ref to pass to ScrollBox's handleRef prop */
  handleRef: React.RefObject<ScrollBoxHandle | null>;
  /** Scroll to a specific row */
  scrollTo: (offset: number) => void;
  /** Scroll to bottom */
  scrollToBottom: () => void;
  /** Get current offset */
  getOffset: () => number;
}

/**
 * Hook to manage ScrollBox imperatively.
 *
 * @example
 * ```tsx
 * const scroll = useScrollBox();
 * // Pass scroll.handleRef to <ScrollBox>
 * // Later: scroll.scrollToBottom()
 * ```
 */
export function useScrollBox(): UseScrollBoxReturn {
  const handleRef = useRef<ScrollBoxHandle | null>(null);

  const scrollTo = useCallback((offset: number) => {
    handleRef.current?.scrollTo(offset);
  }, []);

  const scrollToBottom = useCallback(() => {
    handleRef.current?.scrollToBottom();
  }, []);

  const getOffset = useCallback(() => {
    return handleRef.current?.getOffset() ?? 0;
  }, []);

  return { handleRef, scrollTo, scrollToBottom, getOffset };
}
