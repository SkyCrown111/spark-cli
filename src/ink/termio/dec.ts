/**
 * DEC (Digital Equipment Corporation) Private Mode Sequences.
 *
 * DEC private modes use CSI ? N h (set) and CSI ? N l (reset) format.
 * These are terminal-specific extensions to the ANSI standard.
 *
 * Ported from Claude Code's cc-haha/src/ink/termio/dec.ts
 */

import { csi } from './csi.js';

/**
 * DEC private mode numbers
 */
export const DEC = {
  /** Show/hide text cursor */
  CURSOR_VISIBLE: 25,
  /** Switch to alternate screen buffer (save/restore cursor) */
  ALT_SCREEN_CLEAR: 1049,
  /** Report mouse button press/release and wheel events */
  MOUSE_NORMAL: 1000,
  /** Report mouse button-motion (drag) events */
  MOUSE_BUTTON: 1002,
  /** Report mouse all-motion (hover) events */
  MOUSE_ANY: 1003,
  /** Use SGR extended mouse format (CSI < btn;col;row M/m) */
  MOUSE_SGR: 1006,
  /** Report focus in/out events */
  FOCUS_EVENTS: 1004,
  /** Bracketed paste mode — pasted text wrapped in ESC[200~...ESC[201~ */
  BRACKETED_PASTE: 2004,
  /** Synchronized output — batch screen updates to reduce flicker */
  SYNCHRONIZED_UPDATE: 2026,
} as const;

/** Generate CSI ? N h sequence (set mode) */
export function decset(mode: number): string {
  return csi(`?${mode}h`);
}

/** Generate CSI ? N l sequence (reset mode) */
export function decreset(mode: number): string {
  return csi(`?${mode}l`);
}

// ── Pre-generated sequences for common modes ──

/** Begin synchronized update — batch output to reduce flicker */
export const BSU = decset(DEC.SYNCHRONIZED_UPDATE);
/** End synchronized update — flush batched output */
export const ESU = decreset(DEC.SYNCHRONIZED_UPDATE);

/** Enable bracketed paste mode */
export const EBP = decset(DEC.BRACKETED_PASTE);
/** Disable bracketed paste mode */
export const DBP = decreset(DEC.BRACKETED_PASTE);

/** Enable focus event reporting */
export const EFE = decset(DEC.FOCUS_EVENTS);
/** Disable focus event reporting */
export const DFE = decreset(DEC.FOCUS_EVENTS);

/** Show text cursor */
export const SHOW_CURSOR = decset(DEC.CURSOR_VISIBLE);
/** Hide text cursor */
export const HIDE_CURSOR = decreset(DEC.CURSOR_VISIBLE);

/** Enter alternate screen buffer (saves cursor + clears screen) */
export const ENTER_ALT_SCREEN = decset(DEC.ALT_SCREEN_CLEAR);
/** Exit alternate screen buffer (restores previous screen content) */
export const EXIT_ALT_SCREEN = decreset(DEC.ALT_SCREEN_CLEAR);

/**
 * Enable SGR mouse tracking.
 *
 * Combined modes: 1000 (button/wheel) + 1002 (drag) + 1003 (hover) + 1006 (SGR format).
 * Wheel events surface as key events; click/drag update Ink's selection state.
 */
export const ENABLE_MOUSE_TRACKING =
  decset(DEC.MOUSE_NORMAL) +
  decset(DEC.MOUSE_BUTTON) +
  decset(DEC.MOUSE_ANY) +
  decset(DEC.MOUSE_SGR);

/** Disable all mouse tracking modes */
export const DISABLE_MOUSE_TRACKING =
  decreset(DEC.MOUSE_SGR) +
  decreset(DEC.MOUSE_ANY) +
  decreset(DEC.MOUSE_BUTTON) +
  decreset(DEC.MOUSE_NORMAL);
