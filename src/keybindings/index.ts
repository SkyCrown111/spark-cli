/**
 * Keybinding system — public API exports.
 *
 * This barrel file re-exports all keybinding modules so that
 * consumers can import from a single entry point.
 *
 * Usage:
 *   import { useKeybinding, useRegisterKeybindingContext } from '../keybindings/index.js';
 */

// ── Types ──────────────────────────────────────────────
export type {
  KeybindingContextName,
  KeybindingAction,
  KeyBindingEntry,
  KeybindingBlock,
  UserKeybinding,
  UserKeybindingsFile,
} from './types.js';

// ── Default bindings ───────────────────────────────────
export {
  getDefaultKeybindings,
  getBindingsForContext,
  getAllActions,
} from './defaultBindings.js';

// ── Parser ─────────────────────────────────────────────
export type { KeyCombo, KeySequence } from './parser.js';
export {
  parseKeyCombo,
  parseKeySequence,
  parseContextBindings,
  isChord,
  firstCombo,
} from './parser.js';

// ── Match ──────────────────────────────────────────────
export type { InkKeyEvent } from './match.js';
export {
  inkEventToKeyCombo,
  matchesKeyCombo,
  findMatchingAction,
} from './match.js';

// ── Resolver ───────────────────────────────────────────
export { KeybindingResolver } from './resolver.js';

// ── Reserved shortcuts ─────────────────────────────────
export {
  RESERVED_SHORTCUTS,
  isReserved,
  getReservedShortcuts,
  RESERVED_ACTIONS,
  isReservedAction,
} from './reservedShortcuts.js';

// ── Format ─────────────────────────────────────────────
export {
  formatShortcut,
  formatShortcuts,
  formatShortcutWithDescription,
} from './shortcutFormat.js';

// ── Validation ─────────────────────────────────────────
export type { ValidationIssue, ValidationResult } from './validate.js';
export { validateUserBindings } from './validate.js';

// ── Schema ─────────────────────────────────────────────
export {
  keybindingsSchema,
  exampleKeybindingsConfig,
  generateTemplate,
} from './schema.js';

// ── Loading ────────────────────────────────────────────
export {
  getKeybindingsPath,
  loadUserBindings,
  saveUserBindings,
  userKeybindingsFileExists,
} from './loadUserBindings.js';

// ── React Context ──────────────────────────────────────
export type { KeybindingContextValue } from './KeybindingContext.js';
export {
  KeybindingProvider,
  useKeybindingContext,
} from './KeybindingContext.js';

// ── Provider setup ─────────────────────────────────────
export type { KeybindingProviderSetupProps } from './KeybindingProviderSetup.js';
export { KeybindingProviderSetup } from './KeybindingProviderSetup.js';

// ── Hooks ──────────────────────────────────────────────
export type { ActionBinding } from './useKeybinding.js';
export {
  useKeybinding,
  useKeybindings,
  useRegisterKeybindingContext,
} from './useKeybinding.js';

// ── Display hook ───────────────────────────────────────
export type { ShortcutHint } from './useShortcutDisplay.js';
export { useShortcutDisplay } from './useShortcutDisplay.js';

// ── Template utilities ─────────────────────────────────
export {
  generateKeybindingTable,
  generateActionList,
  generateContextList,
} from './template.js';