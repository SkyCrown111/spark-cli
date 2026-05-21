/**
 * Fullscreen / AlternateScreen configuration utilities.
 *
 * Determines whether the Ink REPL should run in alternate screen buffer
 * mode (no flicker, full terminal control) vs. inline mode (terminal
 * scrollback preserved).
 *
 * Inspired by Claude Code's fullscreen.ts, simplified for gamecli.
 */

/**
 * Whether the fullscreen alternate-screen layout should be active.
 *
 * - SPARK_CLI_NO_FLICKER=1 → enable fullscreen (explicit opt-in)
 * - SPARK_CLI_NO_FLICKER=0 → disable fullscreen (explicit opt-out)
 * - Default → enabled (opposite of Claude Code which defaults off for
 *   external users, but gamecli is always the end-user tool)
 */
export function isFullscreenEnvEnabled(): boolean {
  const val = process.env.SPARK_CLI_NO_FLICKER;

  // Explicit opt-out
  if (val === '0' || val === 'false') return false;

  // Explicit opt-in or default
  return true;
}

/**
 * Whether fullscreen mode should enable SGR mouse tracking.
 * Set SPARK_CLI_DISABLE_MOUSE=1 to keep alt-screen but skip mouse capture.
 */
export function isMouseTrackingEnabled(): boolean {
  const val = process.env.SPARK_CLI_DISABLE_MOUSE;
  return val !== '1' && val !== 'true';
}

/**
 * Whether the terminal likely supports alternate screen buffer.
 * Most modern terminals (xterm, Windows Terminal, iTerm2, kitty) support it.
 */
export function isAlternateScreenSupported(): boolean {
  // Dumb terminals don't support any escape sequences
  if (process.env.TERM === 'dumb') return false;

  // Check if stdout is a TTY
  return process.stdout.isTTY ?? false;
}
