/**
 * FullscreenLayout — four-region fullscreen layout for the Ink REPL.
 *
 * Mirrors Claude Code's FullscreenLayout pattern:
 *
 * ┌──────────────────────────────┐
 * │  scrollable (flexGrow=1)     │ ← Messages area, shrinks to fit
 * │  overflow="hidden"           │
 * │                              │
 * ├──────────────────────────────┤
 * │  bottom (shrink=0)           │ ← Pinned footer, NEVER shrinks
 * │  ┌─ inner (overflow hidden)┐ │    Contains spinner + input + status
 * │  │  Spinner (if loading)    │ │
 * │  │  PromptInput             │ │
 * │  │  Footer                  │ │
 * │  │  StatusLine              │ │
 * │  └─────────────────────────┘ │
 * └──────────────────────────────┘
 *
 * Plus overlay/modal regions rendered on top.
 *
 * The key insight from cc-haha: the bottom section uses
 * explicit height (not percentage) with nested overflow="hidden"
 * to guarantee the input area is ALWAYS visible, even during
 * heavy rendering. Ink's Yoga layout does not reliably enforce
 * maxHeight="50%" when the top section has flexGrow={1}.
 */

import React, { type PropsWithChildren } from 'react';
import { Box } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

// ── Props ──────────────────────────────────────────────

export interface FullscreenLayoutProps {
  /** Scrollable content area (messages) */
  scrollable: React.ReactNode;
  /** Bottom-pinned content area (spinner + input + status) */
  bottom: React.ReactNode;
  /** Overlay content (model picker, theme picker, etc.) */
  overlay?: React.ReactNode;
  /** Modal content (permission request, cost threshold, etc.) */
  modal?: React.ReactNode;
  /** Height reserve for the bottom section (default: 9) */
  footerReserve?: number;
}

// ── Component ──────────────────────────────────────────

/**
 * FullscreenLayout — the standard four-region layout.
 *
 * Layout guarantee: the input area + status bar are ALWAYS visible,
 * even during loading. The messages area shrinks to fit the remaining
 * vertical space. This matches Claude Code's layout where the user
 * always sees the input prompt regardless of agent activity.
 */
export const FullscreenLayout: React.FC<FullscreenLayoutProps> = ({
  scrollable,
  bottom,
  overlay,
  modal,
  footerReserve = 9,
}) => {
  const { width, height } = useTerminalSize();

  // Safety net: ensure messages never push the footer off screen
  const messagesMaxHeight = Math.max(1, height - footerReserve);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* ── Top section: scrollable messages, fixed height ── */}
      <Box flexDirection="column" height={messagesMaxHeight} overflow="hidden">
        {scrollable}
      </Box>

      {/* ── Bottom section: pinned footer, NEVER shrinks ── */}
      <Box flexDirection="column" flexShrink={0} width="100%" height={footerReserve} overflow="hidden">
        <Box flexDirection="column" width="100%" overflow="hidden">
          {bottom}
        </Box>
      </Box>

      {/* ── Overlay region (renders on top of content) ── */}
      {overlay}

      {/* ── Modal region (renders on top of everything) ── */}
      {modal}
    </Box>
  );
};

// ── Convenience sub-components ─────────────────────────

/**
 * ScrollableRegion — wraps content in a scrollable flex container.
 * Use inside FullscreenLayout's `scrollable` prop.
 */
export const ScrollableRegion: React.FC<PropsWithChildren> = ({ children }) => (
  <Box flexDirection="column" overflow="hidden">
    {children}
  </Box>
);

/**
 * BottomRegion — wraps content in a pinned bottom container.
 * Use inside FullscreenLayout's `bottom` prop.
 */
export const BottomRegion: React.FC<PropsWithChildren> = ({ children }) => (
  <Box flexDirection="column" flexShrink={0} width="100%">
    <Box flexDirection="column" width="100%" overflow="hidden">
      {children}
    </Box>
  </Box>
);
