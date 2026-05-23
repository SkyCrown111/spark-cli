/**
 * Shortcut format — formats key combos for display in UI.
 *
 * Converts internal representation (ctrl+c, shift+tab) into
 * human-readable display strings (Ctrl+C, Shift+Tab).
 * Platform-specific adaptations:
 *   - macOS: Ctrl → ⌃, Meta → ⌥, Shift → ⇧
 *   - Windows/Linux: Ctrl, Alt, Shift
 */

import { getPlatform } from '../ink/terminal-querier.js';

// ── Symbol mappings ────────────────────────────────────

const MACOS_SYMBOLS: Record<string, string> = {
  ctrl: '⌃',
  shift: '⇧',
  meta: '⌥',
  alt: '⌥',
};

// ── Formatting ─────────────────────────────────────────

/**
 * Format a key combo string for display.
 *
 * "ctrl+c" → "Ctrl+C" on Windows/Linux, "⌃C" on macOS
 * "shift+tab" → "Shift+Tab" on Windows/Linux, "⇧Tab" on macOS
 * "meta+p" → "Alt+P" on Windows/Linux, "⌥P" on macOS
 */
export function formatShortcut(keyCombo: string): string {
  const platform = getPlatform();
  const useSymbols = platform === 'macos';

  const parts = keyCombo.toLowerCase().split('+');
  const formattedParts: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed === 'ctrl' || trimmed === 'control') {
      formattedParts.push(useSymbols ? MACOS_SYMBOLS['ctrl'] : 'Ctrl');
    } else if (trimmed === 'shift') {
      formattedParts.push(useSymbols ? MACOS_SYMBOLS['shift'] : 'Shift');
    } else if (trimmed === 'meta' || trimmed === 'alt' || trimmed === 'option') {
      formattedParts.push(useSymbols ? MACOS_SYMBOLS['meta'] : 'Alt');
    } else {
      // Key name — capitalize first letter for display
      formattedParts.push(capitalizeKey(trimmed));
    }
  }

  return useSymbols
    ? formattedParts.join('') // macOS: ⌃C (no separator)
    : formattedParts.join('+'); // Windows/Linux: Ctrl+C
}

/**
 * Capitalize a key name for display.
 * "enter" → "Enter", "tab" → "Tab", "a" → "A"
 */
function capitalizeKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();

  // Special key names
  const specialNames: Record<string, string> = {
    enter: 'Enter',
    escape: 'Esc',
    tab: 'Tab',
    back: 'Bksp',
    delete: 'Del',
    pageup: 'PgUp',
    pagedown: 'PgDn',
    home: 'Home',
    end: 'End',
    insert: 'Ins',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    space: 'Space',
  };

  return specialNames[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Format multiple shortcuts as a concise display string.
 * E.g., ["ctrl+c", "ctrl+d"] → "Ctrl+C, Ctrl+D"
 */
export function formatShortcuts(shortcuts: string[]): string {
  return shortcuts.map(formatShortcut).join(', ');
}

/**
 * Format a shortcut with its action description.
 * E.g., ("ctrl+c", "Interrupt") → "Ctrl+C Interrupt"
 */
export function formatShortcutWithDescription(keyCombo: string, description: string): string {
  return `${formatShortcut(keyCombo)} ${description}`;
}
