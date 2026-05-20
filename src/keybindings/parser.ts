/**
 * Key sequence parser — parses key combination strings into
 * structured KeyCombo objects for matching against Ink's key events.
 *
 * Supports chord notation like "ctrl+x ctrl+k" (multi-key sequences)
 * and modifier+key notation like "ctrl+shift+tab".
 *
 * Key combo format:
 *   - Single key: "enter", "escape", "tab", "a", "1"
 *   - Modifier+key: "ctrl+c", "shift+tab", "meta+p", "ctrl+shift+c"
 *   - Chord (multi-key): "ctrl+x ctrl+k" (press ctrl+x then ctrl+k)
 */

import type { KeyBindingEntry } from './types.js';

// ── Types ──────────────────────────────────────────────

export interface KeyCombo {
  /** Main key character (e.g., "c", "enter", "tab") */
  key: string;
  /** Whether Ctrl modifier is required */
  ctrl: boolean;
  /** Whether Shift modifier is required */
  shift: boolean;
  /** Whether Meta/Alt modifier is required */
  meta: boolean;
}

export interface KeySequence {
  /** Ordered list of key combos forming a chord sequence */
  combos: KeyCombo[];
  /** The action this sequence triggers */
  action: string;
}

// ── Normalization ───────────────────────────────────────

/** Normalize a key name to our canonical form. */
function normalizeKey(raw: string): string {
  const key = raw.toLowerCase().trim();

  // Common aliases
  const aliases: Record<string, string> = {
    'return': 'enter',
    'esc': 'escape',
    'del': 'delete',
    'backspace': 'back',
    'space': ' ',
    'pageup': 'pageup',
    'pagedown': 'pagedown',
    'home': 'home',
    'end': 'end',
    'insert': 'insert',
    'uparrow': 'up',
    'downarrow': 'down',
    'leftarrow': 'left',
    'rightarrow': 'right',
  };

  return aliases[key] ?? key;
}

// ── Parsing ─────────────────────────────────────────────

/**
 * Parse a single key combo string (e.g., "ctrl+shift+c") into a KeyCombo.
 */
export function parseKeyCombo(comboStr: string): KeyCombo {
  const parts = comboStr.toLowerCase().split('+');
  let key = '';
  let ctrl = false;
  let shift = false;
  let meta = false;

  for (const part of parts) {
    const normalized = part.trim();
    if (normalized === 'ctrl' || normalized === 'control') {
      ctrl = true;
    } else if (normalized === 'shift') {
      shift = true;
    } else if (normalized === 'meta' || normalized === 'alt' || normalized === 'option') {
      meta = true;
    } else {
      // This is the actual key
      key = normalizeKey(normalized);
    }
  }

  if (!key) {
    throw new Error(`Invalid key combo: "${comboStr}" — no key specified`);
  }

  return { key, ctrl, shift, meta };
}

/**
 * Parse a key binding entry into a KeySequence.
 *
 * Chords (multi-key sequences) are separated by spaces:
 *   "ctrl+x ctrl+k" → [{ctrl:true, key:"x"}, {ctrl:true, key:"k"}]
 *
 * Single combos:
 *   "ctrl+c" → [{ctrl:true, key:"c"}]
 */
export function parseKeySequence(entry: KeyBindingEntry): KeySequence {
  // Split on whitespace to handle chords
  const comboStrings = entry.key.trim().split(/\s+/);

  const combos = comboStrings.map(parseKeyCombo);

  return {
    combos,
    action: entry.action,
  };
}

/**
 * Parse all binding entries in a context block into KeySequences.
 */
export function parseContextBindings(
  _context: string,
  bindings: Record<string, string>,
): KeySequence[] {
  return Object.entries(bindings).map(([keyCombo, action]) =>
    parseKeySequence({ key: keyCombo, action }),
  );
}

/**
 * Check if a key sequence is a chord (multi-key combo).
 */
export function isChord(sequence: KeySequence): boolean {
  return sequence.combos.length > 1;
}

/**
 * Get the first combo from a sequence (for single-key matching).
 */
export function firstCombo(sequence: KeySequence): KeyCombo {
  return sequence.combos[0];
}