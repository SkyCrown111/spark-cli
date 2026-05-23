/**
 * Key matching logic — matches Ink's key events against parsed
 * KeyCombo objects from the keybinding system.
 *
 * Ink provides (input, key) where `input` is the typed character
 * and `key` is an object with boolean flags. This module bridges
 * between Ink's format and our KeyCombo format.
 */

import type { KeyCombo } from './parser.js';

// ── Ink key event interface ────────────────────────────

/** Matches Ink's useInput key parameter shape. */
export interface InkKeyEvent {
  /** Whether Ctrl is held */
  ctrl?: boolean;
  /** Whether Shift is held */
  shift?: boolean;
  /** Whether Meta/Alt is held */
  meta?: boolean;
  /** Whether the key is Return/Enter */
  return?: boolean;
  /** Whether the key is Escape */
  escape?: boolean;
  /** Whether the key is Tab */
  tab?: boolean;
  /** Whether the key is Backspace */
  backspace?: boolean;
  /** Whether the key is Delete */
  delete?: boolean;
  /** Whether an arrow key was pressed */
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  /** Whether PageUp/PageDown was pressed */
  pageUp?: boolean;
  pageDown?: boolean;
  /** Whether Home/End was pressed */
  home?: boolean;
  end?: boolean;
}

// ── Input to KeyCombo conversion ──────────────────────

/**
 * Convert an Ink (input, key) pair into a KeyCombo for matching.
 */
export function inkEventToKeyCombo(input: string, key: InkKeyEvent): KeyCombo {
  // Special keys first
  if (key.return) return { key: 'enter', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.escape) return { key: 'escape', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.tab) return { key: 'tab', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.backspace) return { key: 'back', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.delete) return { key: 'delete', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.pageUp) return { key: 'pageup', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.pageDown)
    return { key: 'pagedown', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.home) return { key: 'home', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.end) return { key: 'end', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.upArrow) return { key: 'up', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.downArrow) return { key: 'down', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.leftArrow) return { key: 'left', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };
  if (key.rightArrow)
    return { key: 'right', ctrl: !!key.ctrl, shift: !!key.shift, meta: !!key.meta };

  // Regular character
  return {
    key: input.toLowerCase(),
    ctrl: !!key.ctrl,
    shift: !!key.shift,
    meta: !!key.meta,
  };
}

// ── Matching ──────────────────────────────────────────

/**
 * Check whether an Ink key event matches a KeyCombo from a binding.
 *
 * Both the key character and modifier flags must match exactly.
 * A combo with ctrl=true only matches when Ctrl is held, etc.
 */
export function matchesKeyCombo(event: KeyCombo, binding: KeyCombo): boolean {
  // Key must match exactly
  if (event.key !== binding.key) return false;

  // Modifiers must match exactly — a binding with ctrl=true
  // should only fire when ctrl IS held, and a binding with
  // ctrl=false should only fire when ctrl IS NOT held.
  if (event.ctrl !== binding.ctrl) return false;
  if (event.shift !== binding.shift) return false;
  if (event.meta !== binding.meta) return false;

  return true;
}

/**
 * Find the first matching KeySequence for an Ink key event.
 *
 * Scans through a list of parsed sequences and returns the
 * action string of the first sequence whose first combo matches.
 * (Chord matching requires additional state — see resolver.ts.)
 */
export function findMatchingAction(
  event: KeyCombo,
  sequences: { combos: KeyCombo[]; action: string }[],
): string | undefined {
  for (const seq of sequences) {
    // Only match single-key sequences here (chords handled by resolver)
    if (seq.combos.length === 1 && matchesKeyCombo(event, seq.combos[0])) {
      return seq.action;
    }
  }
  return undefined;
}
