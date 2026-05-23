/**
 * AlternateScreen — enters the terminal's alternate screen buffer.
 *
 * While mounted:
 * - Enters the alt screen (DEC 1049), clears it, homes the cursor
 * - Constrains height to the terminal row count, so overflow must
 *   be handled via ScrollBox / flexbox (no native scrollback)
 * - Optionally enables SGR mouse tracking (wheel + click/drag)
 * - Enables bracketed paste mode (DEC 2004) so pasted text is
 *   wrapped in ESC[200~...ESC[201~ for reliable paste detection
 * - Enables focus event reporting (DEC 1004) so the REPL can
 *   pause/resume when the terminal loses/gains focus
 *
 * On unmount, disables all features and exits the alt screen,
 * restoring the main screen's content.
 *
 * This is the key to flicker-free rendering: the alt screen buffer
 * gives us full control over the viewport — no scrollback accumulation,
 * no content shifting when new lines are printed.
 *
 * Ported from Claude Code's AlternateScreen.tsx, adapted for standard Ink.
 */

import React, { type PropsWithChildren, useEffect, useState, useCallback } from 'react';
import { Box } from 'ink';
import {
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
  ENABLE_MOUSE_TRACKING,
  DISABLE_MOUSE_TRACKING,
  EBP,
  DBP,
  EFE,
  DFE,
} from '../termio/dec.js';
import { isMouseTrackingEnabled } from '../../utils/fullscreen.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

type Props = PropsWithChildren<{
  /** Enable SGR mouse tracking (wheel + click/drag). Default true. */
  mouseTracking?: boolean;
  /** Enable bracketed paste mode. Default true. */
  bracketedPaste?: boolean;
  /** Enable focus event reporting. Default false (causes stdin conflicts on Windows). */
  focusEvents?: boolean;
}>;

/**
 * Write a raw escape sequence to stdout.
 * Safe no-op if stdout is not available.
 */
function writeRaw(sequence: string): void {
  try {
    process.stdout.write(sequence);
  } catch {
    // Terminal may not support the sequence
  }
}

/**
 * AlternateScreen component — wraps children in the terminal's
 * alternate screen buffer for flicker-free rendering.
 */
export const AlternateScreen: React.FC<Props> = ({
  children,
  mouseTracking = false,
  bracketedPaste = true,
  focusEvents = false,
}) => {
  const { height } = useTerminalSize();
  const shouldEnableMouse = mouseTracking && isMouseTrackingEnabled();

  // ── Focus state tracking ──
  // ── Focus state tracking (for future: dim when unfocused) ──
  const [, setHasFocus] = useState(true);

  const handleFocusIn = useCallback(() => {
    setHasFocus(true);
  }, []);

  const handleFocusOut = useCallback(() => {
    setHasFocus(false);
  }, []);

  // ── Focus event parsing ──
  useEffect(() => {
    if (!focusEvents) return;

    // Parse focus events from stdin
    // Focus In:  ESC [ I
    // Focus Out: ESC [ O
    let buffer = '';

    const onData = (data: Buffer) => {
      buffer += data.toString('utf8');

      // Process buffer for focus sequences
      while (buffer.length > 0) {
        const focusInIdx = buffer.indexOf('\x1b[I');
        const focusOutIdx = buffer.indexOf('\x1b[O');

        if (focusInIdx !== -1 && (focusOutIdx === -1 || focusInIdx < focusOutIdx)) {
          handleFocusIn();
          buffer = buffer.slice(focusInIdx + 3);
        } else if (focusOutIdx !== -1) {
          handleFocusOut();
          buffer = buffer.slice(focusOutIdx + 3);
        } else {
          // No complete focus sequence found
          // Keep only the last 3 chars (potential partial sequence)
          if (buffer.length > 3) {
            buffer = buffer.slice(-3);
          }
          break;
        }
      }
    };

    // Only listen if stdin is a TTY and supports raw mode
    if (process.stdin.isTTY && typeof process.stdin.on === 'function') {
      process.stdin.on('data', onData);
    }

    return () => {
      if (process.stdin.isTTY && typeof process.stdin.off === 'function') {
        process.stdin.off('data', onData);
      }
    };
  }, [focusEvents, handleFocusIn, handleFocusOut]);

  useEffect(() => {
    // Fullscreen renderer always uses alternate screen (Ink-only path).
    writeRaw(
      ENTER_ALT_SCREEN +
        '\x1b[2J\x1b[H' +
        (shouldEnableMouse ? ENABLE_MOUSE_TRACKING : '') +
        (bracketedPaste ? EBP : '') +
        (focusEvents ? EFE : ''),
    );

    return () => {
      writeRaw(
        (focusEvents ? DFE : '') +
          (bracketedPaste ? DBP : '') +
          (shouldEnableMouse ? DISABLE_MOUSE_TRACKING : '') +
          EXIT_ALT_SCREEN,
      );
    };
  }, [shouldEnableMouse, bracketedPaste, focusEvents]);

  return (
    <Box flexDirection="column" height={height} width="100%" flexShrink={0}>
      {children}
    </Box>
  );
};
