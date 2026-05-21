/**
 * ScrollBox — a scrollable viewport container for Ink.
 *
 * Manages a virtual viewport offset over a list of child rows.
 * Supports keyboard-driven scrolling (PageUp/PageDown/Home/End),
 * mouse wheel scrolling (SGR mouse tracking), sticky scroll
 * (auto-pin-to-bottom), and imperative scroll control.
 *
 * This is a lightweight implementation that does NOT fork Ink's
 * renderer — it works within standard Ink's Box component by
 * slicing children to only render the visible window.
 *
 * After P1.2: adds mouse wheel scroll support, sticky scroll
 * detection, and new-message pill indicator.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

// ── SGR Mouse Event Parser ────────────────────────────

interface MouseEvent {
  /** Button: 0=left, 1=middle, 2=right, 3=release, 64=scrollUp, 65=scrollDown */
  button: number;
  /** Column (1-based) */
  col: number;
  /** Row (1-based) */
  row: number;
  /** Whether Shift was held */
  shift: boolean;
  /** Whether Alt/Meta was held */
  meta: boolean;
  /** Whether Ctrl was held */
  ctrl: boolean;
  /** Whether the button was released (M) vs pressed (m) */
  release: boolean;
}

/**
 * Parse an SGR-encoded mouse event from stdin.
 * Format: ESC [ < button ; col ; row M/m
 * Button encoding: 0=left, 1=middle, 2=right, 4+shift, 8+meta, 16+ctrl, 64=scrollUp, 65=scrollDown
 */
function parseSGRMouseEvent(seq: string): MouseEvent | null {
  // Match: \x1b[<\d+;\d+;\d+[Mm]
  const match = seq.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return null;

  const rawBtn = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  const row = parseInt(match[3], 10);
  const release = match[4] === 'm';

  return {
    button: rawBtn & 63, // Lower 6 bits for button
    col,
    row,
    shift: (rawBtn & 4) !== 0,
    meta: (rawBtn & 8) !== 0,
    ctrl: (rawBtn & 16) !== 0,
    release,
  };
}

// ── ScrollBox Handle ──────────────────────────────────

export interface ScrollBoxHandle {
  /** Scroll to a specific row offset */
  scrollTo: (offset: number) => void;
  /** Scroll to bottom (pin) */
  scrollToBottom: () => void;
  /** Scroll by a delta (positive = down, negative = up) */
  scrollBy: (delta: number) => void;
  /** Get current viewport offset */
  getOffset: () => number;
  /** Get total row count */
  getRowCount: () => number;
  /** Whether currently pinned to bottom */
  isSticky: () => boolean;
  /** Subscribe to scroll changes */
  subscribe: (listener: () => void) => () => void;
}

// ── Props ──────────────────────────────────────────────

export interface ScrollBoxProps {
  /** Total number of rows in the content */
  rowCount: number;
  /** Estimated height per row (default: 1) */
  estimatedRowHeight?: number;
  /** Maximum visible height (default: terminal height) */
  maxHeight?: number;
  /** Whether to auto-pin to bottom on new content (default: true) */
  autoPinToBottom?: boolean;
  /** Whether sticky scroll is enabled (default: true) */
  stickyScroll?: boolean;
  /** Children to render — only visible rows are actually rendered */
  children: (visibleStart: number, visibleEnd: number) => React.ReactNode;
  /** Buffer rows to render above/below viewport for smooth scrolling */
  buffer?: number;
  /** Whether scrolling keybindings are active */
  scrollingEnabled?: boolean;
  /** Whether mouse wheel scrolling is enabled (default: true) */
  mouseScrollEnabled?: boolean;
  /** Callback when scroll offset changes */
  onScroll?: (offset: number) => void;
  /** External handle ref for imperative control */
  handleRef?: React.RefObject<ScrollBoxHandle | null>;
  /** Number of new messages that arrived while not at bottom (for pill display) */
  newMessageCount?: number;
}

// ── Component ──────────────────────────────────────────

/**
 * ScrollBox component for Ink terminal UI.
 *
 * Renders only the rows within the visible viewport plus a buffer,
 * enabling smooth scrolling through large content without performance
 * degradation. Supports keyboard scrolling, mouse wheel, sticky
 * scroll detection, and imperative control.
 */
export const ScrollBox: React.FC<ScrollBoxProps> = ({
  rowCount,
  estimatedRowHeight = 1,
  maxHeight,
  autoPinToBottom = true,
  stickyScroll = true,
  children,
  buffer = 2,
  scrollingEnabled = true,
  mouseScrollEnabled = true,
  onScroll,
  handleRef,
  newMessageCount = 0,
}) => {
  const { height: terminalHeight } = useTerminalSize();
  const viewportHeight = maxHeight ?? Math.max(terminalHeight - 8, 5);
  const visibleRows = Math.max(1, Math.floor(viewportHeight / estimatedRowHeight));

  // Calculate initial offset based on autoPinToBottom
  const initialOffset = useMemo(() => {
    if (autoPinToBottom || stickyScroll) {
      return Math.max(0, rowCount - visibleRows);
    }
    return 0;
  // Only compute on mount; subsequent changes handled by useEffect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [offset, setOffset] = useState(initialOffset);
  const prevRowCountRef = useRef(rowCount);
  const isStickyRef = useRef(autoPinToBottom || stickyScroll);
  const listenersRef = useRef(new Set<() => void>());

  // Notify listeners
  const notify = useCallback(() => {
    for (const l of listenersRef.current) l();
  }, []);

  // Auto-pin to bottom when new content arrives (rowCount grows)
  useEffect(() => {
    if (isStickyRef.current && rowCount > prevRowCountRef.current) {
      const newOffset = Math.max(0, rowCount - visibleRows);
      setOffset(newOffset);
    }
    prevRowCountRef.current = rowCount;
  }, [rowCount, visibleRows]);

  // Notify parent of scroll changes
  useEffect(() => {
    onScroll?.(offset);
    notify();
  }, [offset, onScroll, notify]);

  // Clamp offset when rowCount shrinks
  useEffect(() => {
    const maxOffset = Math.max(0, rowCount - visibleRows);
    if (offset > maxOffset) {
      setOffset(maxOffset);
    }
  }, [rowCount, visibleRows]);

  // ── Mouse wheel scrolling ──
  useEffect(() => {
    if (!mouseScrollEnabled || !scrollingEnabled) return;

    let mouseBuffer = '';

    const onData = (data: Buffer) => {
      mouseBuffer += data.toString('utf8');

      // Process buffer for SGR mouse sequences: ESC [ < ...
      while (mouseBuffer.length > 0) {
        // Look for the start of an SGR mouse sequence
        const sgrStart = mouseBuffer.indexOf('\x1b[<');
        if (sgrStart === -1) {
          // No SGR sequence found — keep only last few chars (potential partial)
          if (mouseBuffer.length > 10) {
            mouseBuffer = mouseBuffer.slice(-10);
          }
          break;
        }

        // Find the end of the SGR sequence (M or m)
        const seqAfterStart = mouseBuffer.slice(sgrStart);
        const endMatch = seqAfterStart.match(/^\x1b\[<\d+;\d+;\d+[Mm]/);
        if (endMatch) {
          const seq = endMatch[0];
          mouseBuffer = mouseBuffer.slice(sgrStart + seq.length);

          const evt = parseSGRMouseEvent(seq);
          if (evt) {
            // Button 64 = scroll up, 65 = scroll down
            if (evt.button === 64) {
              // Scroll up
              setOffset((prev) => {
                const newOff = Math.max(0, prev - 3);
                if (newOff !== prev) {
                  isStickyRef.current = false;
                }
                return newOff;
              });
            } else if (evt.button === 65) {
              // Scroll down
              const maxOff = Math.max(0, rowCount - visibleRows);
              setOffset((prev) => {
                const newOff = Math.min(maxOff, prev + 3);
                // If we scrolled to the bottom, re-enable sticky
                if (newOff >= maxOff) {
                  isStickyRef.current = true;
                } else {
                  isStickyRef.current = false;
                }
                return newOff;
              });
            }
          }
        } else {
          // Incomplete sequence — wait for more data
          if (mouseBuffer.length > 30) {
            // Safety: discard if too long without a complete sequence
            mouseBuffer = mouseBuffer.slice(sgrStart + 3);
          }
          break;
        }
      }
    };

    if (process.stdin.isTTY && typeof process.stdin.on === 'function') {
      process.stdin.on('data', onData);
    }

    return () => {
      if (process.stdin.isTTY && typeof process.stdin.off === 'function') {
        process.stdin.off('data', onData);
      }
    };
  }, [mouseScrollEnabled, scrollingEnabled, rowCount, visibleRows]);

  // Keyboard scrolling
  // NOTE: up/down arrows are NOT handled here — they belong to
  // PromptInput (history navigation, cursor movement). Use PageUp/
  // PageDown/Home/End for scrolling instead.
  useInput((_input, key) => {
    if (!scrollingEnabled) return;

    if (key.pageUp) {
      setOffset((prev) => {
        const newOff = Math.max(0, prev - visibleRows);
        isStickyRef.current = false;
        return newOff;
      });
    } else if (key.pageDown) {
      const maxOff = Math.max(0, rowCount - visibleRows);
      setOffset((prev) => {
        const newOff = Math.min(maxOff, prev + visibleRows);
        if (newOff >= maxOff) isStickyRef.current = true;
        return newOff;
      });
    } else if (key.ctrl && _input === 'home') {
      isStickyRef.current = false;
      setOffset(0);
    } else if (key.ctrl && _input === 'end') {
      isStickyRef.current = true;
      setOffset(Math.max(0, rowCount - visibleRows));
    }
  });

  // ── Imperative handle ──
  const scrollTo = useCallback((newOffset: number) => {
    const maxOff = Math.max(0, rowCount - visibleRows);
    isStickyRef.current = newOffset >= maxOff;
    setOffset(Math.max(0, Math.min(maxOff, newOffset)));
  }, [rowCount, visibleRows]);

  const scrollToBottom = useCallback(() => {
    isStickyRef.current = true;
    setOffset(Math.max(0, rowCount - visibleRows));
  }, [rowCount, visibleRows]);

  const scrollBy = useCallback((delta: number) => {
    setOffset((prev) => {
      const maxOff = Math.max(0, rowCount - visibleRows);
      const newOff = Math.max(0, Math.min(maxOff, prev + delta));
      isStickyRef.current = newOff >= maxOff;
      return newOff;
    });
  }, [rowCount, visibleRows]);

  const getOffsetFn = useCallback(() => offset, [offset]);
  const getRowCountFn = useCallback(() => rowCount, [rowCount]);
  const isStickyFn = useCallback(() => isStickyRef.current, []);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    if (handleRef) {
      handleRef.current = {
        scrollTo,
        scrollToBottom,
        scrollBy,
        getOffset: getOffsetFn,
        getRowCount: getRowCountFn,
        isSticky: isStickyFn,
        subscribe,
      };
    }
  }, [handleRef, scrollTo, scrollToBottom, scrollBy, getOffsetFn, getRowCountFn, isStickyFn, subscribe]);

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
      {/* New message pill — shows when content arrives while not at bottom */}
      {!isStickyRef.current && newMessageCount > 0 && (
        <Box justifyContent="center" paddingX={1}>
          <Text backgroundColor="blue" color="white"> {newMessageCount} new message{newMessageCount > 1 ? 's' : ''} ↓ </Text>
        </Box>
      )}
    </Box>
  );
};
