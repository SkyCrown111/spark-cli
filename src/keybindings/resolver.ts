/**
 * Keybinding resolver — resolves a key event to an action
 * based on the current context stack and priority rules.
 *
 * The resolver maintains an ordered stack of active contexts.
 * When a key event arrives, it searches through the active
 * contexts from most-specific (top of stack) to least-specific
 * (Global) and returns the first matching action.
 *
 * This allows context-specific overrides: e.g., "enter" in
 * Autocomplete context means "accept suggestion", but in
 * Chat context means "submit message".
 */

import type { KeybindingContextName, KeybindingBlock, UserKeybinding } from './types.js';
import type { KeyCombo, KeySequence } from './parser.js';
import { getDefaultKeybindings } from './defaultBindings.js';
import { parseKeySequence } from './parser.js';
import { matchesKeyCombo } from './match.js';

// ── Context priority ───────────────────────────────────

/**
 * Default context priority order (most specific first).
 * The resolver searches contexts in this order; Global is always last.
 */
const CONTEXT_PRIORITY: KeybindingContextName[] = [
  'Autocomplete',
  'HistorySearch',
  'Confirmation',
  'Select',
  'ModelPicker',
  'ThemePicker',
  'Settings',
  'DiffDialog',
  'MessageSelector',
  'MessageActions',
  'Attachments',
  'Transcript',
  'Task',
  'Help',
  'Plugin',
  'Tabs',
  'Footer',
  'Scroll',
  'Chat',
  'Global',
];

// ── Resolver class ────────────────────────────────────

export class KeybindingResolver {
  /** Default bindings (platform-adapted) */
  private defaultBlocks: KeybindingBlock[];

  /** User override bindings */
  private userBindings: UserKeybinding[];

  /** Active context stack (ordered, most specific first) */
  private contextStack: KeybindingContextName[];

  /** Parsed sequences cache per context */
  private parsedCache: Map<KeybindingContextName, KeySequence[]>;

  constructor(
    defaultBlocks?: KeybindingBlock[],
    userBindings?: UserKeybinding[],
    contextStack?: KeybindingContextName[],
  ) {
    this.defaultBlocks = defaultBlocks ?? getDefaultKeybindings();
    this.userBindings = userBindings ?? [];
    this.contextStack = contextStack ?? ['Global'];
    this.parsedCache = new Map();
    this.rebuildCache();
  }

  // ── Context management ──────────────────────────────

  /**
   * Push a new context onto the stack.
   * This context becomes the highest priority for key resolution.
   */
  pushContext(context: KeybindingContextName): void {
    // Remove if already present (move to top)
    this.contextStack = this.contextStack.filter((c) => c !== context);
    this.contextStack.unshift(context);
  }

  /**
   * Remove a context from the stack.
   */
  popContext(context: KeybindingContextName): void {
    this.contextStack = this.contextStack.filter((c) => c !== context);
    // Ensure Global is always present
    if (!this.contextStack.includes('Global')) {
      this.contextStack.push('Global');
    }
  }

  /**
   * Replace the entire context stack.
   */
  setContextStack(stack: KeybindingContextName[]): void {
    // Ensure Global is always last
    const filtered = stack.filter((c) => c !== 'Global');
    this.contextStack = [...filtered, 'Global'];
  }

  /**
   * Get the current context stack.
   */
  getContextStack(): KeybindingContextName[] {
    return [...this.contextStack];
  }

  /**
   * Get the topmost (most specific) active context.
   */
  getActiveContext(): KeybindingContextName {
    return this.contextStack[0] ?? 'Global';
  }

  // ── User bindings ────────────────────────────────────

  /**
   * Add or update a user binding override.
   */
  addUserBinding(binding: UserKeybinding): void {
    // Remove existing override for same context+key
    this.userBindings = this.userBindings.filter(
      (b) => !(b.context === binding.context && b.key === binding.key),
    );
    this.userBindings.push(binding);
    this.rebuildCache();
  }

  /**
   * Remove a user binding override.
   */
  removeUserBinding(context: KeybindingContextName, key: string): void {
    this.userBindings = this.userBindings.filter(
      (b) => !(b.context === context && b.key === key),
    );
    this.rebuildCache();
  }

  /**
   * Set all user bindings at once (e.g., from loaded file).
   */
  setUserBindings(bindings: UserKeybinding[]): void {
    this.userBindings = bindings;
    this.rebuildCache();
  }

  // ── Resolution ──────────────────────────────────────

  /**
   * Resolve a key event to an action.
   *
   * Searches through the context stack from top to bottom,
   * checking user overrides first then default bindings.
   * Returns the first matching action, or undefined if no
   * binding matches.
   */
  resolve(event: KeyCombo): string | undefined {
    // Merge default and user bindings per context
    for (const context of this.getEffectiveContextStack()) {
      const sequences = this.parsedCache.get(context);
      if (!sequences) continue;

      for (const seq of sequences) {
        // Only match single-combo sequences (chords handled separately)
        if (seq.combos.length === 1 && matchesKeyCombo(event, seq.combos[0])) {
          return seq.action;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the effective context stack for resolution.
   * Uses the actual stack, but ensures the priority order
   * is respected for contexts not in the stack.
   */
  private getEffectiveContextStack(): KeybindingContextName[] {
    const stack = this.contextStack;
    // If stack has more than just Global, use it directly
    if (stack.length > 1) return stack;

    // Otherwise, use the default priority order (always ends with Global)
    return CONTEXT_PRIORITY;
  }

  // ── Cache management ────────────────────────────────

  /**
   * Rebuild the parsed sequences cache for all contexts.
   * Merges user overrides with default bindings.
   */
  private rebuildCache(): void {
    this.parsedCache.clear();

    for (const block of this.defaultBlocks) {
      // Start with default bindings
      const mergedBindings: Record<string, string> = { ...block.bindings };

      // Apply user overrides for this context
      for (const userBinding of this.userBindings) {
        if (userBinding.context === block.context) {
          // User override replaces the default key for this action,
          // or adds a new key→action mapping
          mergedBindings[userBinding.key] = userBinding.action;
        }
      }

      // Parse all bindings into sequences
      const sequences: KeySequence[] = [];
      for (const [keyCombo, action] of Object.entries(mergedBindings)) {
        try {
          sequences.push(parseKeySequence({ key: keyCombo, action }));
        } catch {
          // Skip invalid key combos silently
        }
      }

      this.parsedCache.set(block.context, sequences);
    }
  }

  // ── Inspection ──────────────────────────────────────

  /**
   * Get all bindings for a specific context (merged defaults + user overrides).
   */
  getBindingsForContext(context: KeybindingContextName): Record<string, string> {
    const sequences = this.parsedCache.get(context);
    if (!sequences) return {};

    const bindings: Record<string, string> = {};
    for (const seq of sequences) {
      // Reconstruct key string from combo
      const keyStr = seq.combos.map(formatCombo).join(' ');
      bindings[keyStr] = seq.action;
    }
    return bindings;
  }

  /**
   * Get the key combo that triggers a specific action in a context.
   */
  getKeyForAction(
    context: KeybindingContextName,
    action: string,
  ): string | undefined {
    const sequences = this.parsedCache.get(context);
    if (!sequences) return undefined;

    for (const seq of sequences) {
      if (seq.action === action) {
        return seq.combos.map(formatCombo).join(' ');
      }
    }
    return undefined;
  }
}

// ── Helpers ──────────────────────────────────────────

function formatCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl)  parts.push('ctrl');
  if (combo.shift) parts.push('shift');
  if (combo.meta)  parts.push('meta');
  parts.push(combo.key);
  return parts.join('+');
}