/**
 * ScrollBox — a scrollable viewport container for Ink.
 *
 * Manages a virtual viewport offset over a list of child rows.
 * Supports keyboard-driven scrolling (PageUp/PageDown/Home/End)
 * and auto-pin-to-bottom when new content arrives.
 *
 * This is a lightweight implementation that does NOT fork Ink's
 * renderer — it works within standard Ink's Box component by
 * slicing children to only render the visible window.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

export interface ScrollBoxHandle {
  /** Scroll to a specific row offset */
  scrollTo: (offset: number) => void;
  /** Scroll to bottom (pin) */
  scrollToBottom: () => void;
  /** Get current viewport offset */
  getOffset: () => number;
}

export interface ScrollBoxProps {
  /** Total number of rows in the content */
  rowCount: number;
  /** Estimated height per row (default: 1) */
  estimatedRowHeight?: number;
  /** Maximum visible height (default: terminal height) */
  maxHeight?: number;
  /** Whether to auto-pin to bottom on new content */
  autoPinToBottom?: boolean;
  /** Children to render — only visible rows are actually rendered */
  children: (visibleStart: number, visibleEnd: number) => React.ReactNode;
  /** Buffer rows to render above/below viewport for smooth scrolling */
  buffer?: number;
  /** Whether scrolling keybindings are active */
  scrollingEnabled?: boolean;
  /** Callback when scroll offset changes */
  onScroll?: (offset: number) => void;
  /** External handle ref for imperative control */
  handleRef?: React.RefObject<ScrollBoxHandle | null>;
}

/**
 * ScrollBox component for Ink terminal UI.
 *
 * Renders only the rows within the visible viewport plus a buffer,
 * enabling smooth scrolling through large content without performance
 * degradation.
 *
 * @example
 * ```tsx
 * <ScrollBox rowCount={messages.length} estimatedRowHeight={3}>
 *   {(start, end) => messages.slice(start, end).map(renderMessage)}
 * </ScrollBox>
 * ```
 */
export const ScrollBox: React.FC<ScrollBoxProps> = ({
  rowCount,
  estimatedRowHeight = 1,
  maxHeight,
  autoPinToBottom = true,
  children,
  buffer = 2,
  scrollingEnabled = true,
  onScroll,
  handleRef,
}) => {
  const { height: terminalHeight } = useTerminalSize();
  const viewportHeight = maxHeight ?? Math.max(terminalHeight - 8, 5);
  const visibleRows = Math.max(1, Math.floor(viewportHeight / estimatedRowHeight));

  // Calculate initial offset based on autoPinToBottom
  const initialOffset = useMemo(() => {
    if (autoPinToBottom) {
      return Math.max(0, rowCount - visibleRows);
    }
    return 0;
  // Only compute on mount; subsequent changes handled by useEffect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [offset, setOffset] = useState(initialOffset);
  const prevRowCountRef = useRef(rowCount);

  // Auto-pin to bottom when new content arrives (rowCount grows)
  useEffect(() => {
    if (autoPinToBottom && rowCount > prevRowCountRef.current) {
      const newOffset = Math.max(0, rowCount - visibleRows);
      setOffset(newOffset);
    }
    prevRowCountRef.current = rowCount;
  }, [rowCount, autoPinToBottom, visibleRows]);

  // Notify parent of scroll changes
  useEffect(() => {
    onScroll?.(offset);
  }, [offset, onScroll]);

  // Clamp offset when rowCount shrinks
  useEffect(() => {
    const maxOffset = Math.max(0, rowCount - visibleRows);
    if (offset > maxOffset) {
      setOffset(maxOffset);
    }
  }, [rowCount, visibleRows]);

  // Keyboard scrolling
  useInput((_input, key) => {
    if (!scrollingEnabled) return;

    if (key.pageUp) {
      setOffset((prev) => Math.max(0, prev - visibleRows));
    } else if (key.pageDown) {
      const maxOff = Math.max(0, rowCount - visibleRows);
      setOffset((prev) => Math.min(maxOff, prev + visibleRows));
    } else if (key.ctrl && _input === 'home') {
      setOffset(0);
    } else if (key.ctrl && _input === 'end') {
      setOffset(Math.max(0, rowCount - visibleRows));
    } else if (key.upArrow) {
      setOffset((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      const maxOff = Math.max(0, rowCount - visibleRows);
      setOffset((prev) => Math.min(maxOff, prev + 1));
    }
  });

  // Imperative handle
  const scrollTo = useCallback((newOffset: number) => {
    const maxOff = Math.max(0, rowCount - visibleRows);
    setOffset(Math.max(0, Math.min(maxOff, newOffset)));
  }, [rowCount, visibleRows]);

  const scrollToBottom = useCallback(() => {
    setOffset(Math.max(0, rowCount - visibleRows));
  }, [rowCount, visibleRows]);

  const getOffsetFn = useCallback(() => offset, [offset]);

  useEffect(() => {
    if (handleRef) {
      handleRef.current = { scrollTo, scrollToBottom, getOffset: getOffsetFn };
    }
  }, [handleRef, scrollTo, scrollToBottom, getOffsetFn]);

  // Compute visible range with buffer
  const visibleStart = Math.max(0, offset - buffer);
  const visibleEnd = Math.min(rowCount, offset + visibleRows + buffer);

  // Overflow indicators
  const hiddenAbove = offset > 0;
  const hiddenBelow = offset + visibleRows < rowCount;

  return (
    <Box flexDirection="column" maxHeight={viewportHeight} overflow="hidden">
      {hiddenAbove && (
        <Box paddingX={1}>
          <Text dimColor>↑ {offset} earlier rows hidden</Text>
        </Box>
      )}
      {children(visibleStart, visibleEnd)}
      {hiddenBelow && (
        <Box paddingX={1}>
          <Text dimColor>↓ {rowCount - offset - visibleRows} more rows below</Text>
        </Box>
      )}
    </Box>
  );
};