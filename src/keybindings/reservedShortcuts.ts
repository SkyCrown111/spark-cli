/**
 * Reserved shortcuts — key combinations that cannot be
 * re-bound by users. These are essential for the CLI's
 * safe operation and must always work regardless of
 * user configuration.
 *
 * Ctrl+C (interrupt) and Ctrl+D (exit) are reserved
 * because they are fundamental safety controls.
 */

/** Reserved key combos that cannot be overridden */
export const RESERVED_SHORTCUTS: readonly string[] = [
  'ctrl+c',   // app:interrupt — always works to stop the current operation
  'ctrl+d',   // app:exit — always works to exit the REPL
];

/**
 * Check if a key combo is reserved (cannot be re-bound).
 */
export function isReserved(keyCombo: string): boolean {
  const normalized = keyCombo.toLowerCase().trim();
  return RESERVED_SHORTCUTS.includes(normalized);
}

/**
 * Get all reserved shortcuts.
 */
export function getReservedShortcuts(): string[] {
  return [...RESERVED_SHORTCUTS];
}

/**
 * Reserved actions that must always have a binding.
 */
export const RESERVED_ACTIONS: readonly string[] = [
  'app:interrupt',
  'app:exit',
];

/**
 * Check if an action is reserved.
 */
export function isReservedAction(action: string): boolean {
  return RESERVED_ACTIONS.includes(action);
}