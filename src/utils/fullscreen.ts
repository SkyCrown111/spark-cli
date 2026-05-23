/**
 * Fullscreen / alternate-screen environment helpers.
 *
 * Maps to Claude Code's CLAUDE_CODE_NO_FLICKER (opt-in fullscreen renderer).
 * Renderer selection itself lives in `core/repl/renderer.ts`.
 */

/**
 * Whether env opts into the fullscreen renderer (SPARK_CLI_NO_FLICKER=1).
 *
 * - SPARK_CLI_NO_FLICKER=1 / true → fullscreen renderer
 * - SPARK_CLI_NO_FLICKER=0 / false → explicit opt-out
 * - unset → no env preference (default renderer stays main-screen)
 */
export function isFullscreenEnvEnabled(): boolean {
  const val = process.env.SPARK_CLI_NO_FLICKER;
  if (val === '0' || val === 'false') return false;
  return val === '1' || val === 'true';
}

/**
 * Whether fullscreen mode should enable SGR mouse tracking.
 * Set SPARK_CLI_ENABLE_MOUSE=1 to opt in to mouse tracking.
 *
 * Mouse tracking is disabled by default because SGR mouse escape
 * sequences leak into Ink's useInput as phantom characters on
 * many terminals (especially Windows).
 */
export function isMouseTrackingEnabled(): boolean {
  const val = process.env.SPARK_CLI_ENABLE_MOUSE;
  return val === '1' || val === 'true';
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
