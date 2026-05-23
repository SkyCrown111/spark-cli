/**
 * Keybinding resolver resolves a key event to an action
 * based on the current active context stack.
 *
 * Contexts are searched from most-specific (front of the stack)
 * to least-specific (`Global`).
 */

import type { KeybindingContextName, KeybindingBlock, UserKeybinding } from './types.js';
import type { KeyCombo, KeySequence } from './parser.js';
import { getDefaultKeybindings } from './defaultBindings.js';
import { parseKeySequence } from './parser.js';
import { matchesKeyCombo } from './match.js';

export class KeybindingResolver {
  /** Default bindings (platform-adapted). */
  private defaultBlocks: KeybindingBlock[];

  /** User override bindings. */
  private userBindings: UserKeybinding[];

  /** Active context stack (ordered, most specific first). */
  private contextStack: KeybindingContextName[];

  /** Parsed sequences cache per context. */
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

  /**
   * Push a new context onto the stack.
   * This context becomes the highest priority for key resolution.
   */
  pushContext(context: KeybindingContextName): void {
    this.contextStack = this.contextStack.filter((c) => c !== context);
    this.contextStack.unshift(context);
  }

  /** Remove a context from the stack. */
  popContext(context: KeybindingContextName): void {
    this.contextStack = this.contextStack.filter((c) => c !== context);
    if (!this.contextStack.includes('Global')) {
      this.contextStack.push('Global');
    }
  }

  /** Replace the entire context stack. */
  setContextStack(stack: KeybindingContextName[]): void {
    const filtered = stack.filter((c) => c !== 'Global');
    this.contextStack = [...filtered, 'Global'];
  }

  /** Get the current context stack. */
  getContextStack(): KeybindingContextName[] {
    return [...this.contextStack];
  }

  /** Get the topmost active context. */
  getActiveContext(): KeybindingContextName {
    return this.contextStack[0] ?? 'Global';
  }

  /** Add or update a user binding override. */
  addUserBinding(binding: UserKeybinding): void {
    this.userBindings = this.userBindings.filter(
      (b) => !(b.context === binding.context && b.key === binding.key),
    );
    this.userBindings.push(binding);
    this.rebuildCache();
  }

  /** Remove a user binding override. */
  removeUserBinding(context: KeybindingContextName, key: string): void {
    this.userBindings = this.userBindings.filter((b) => !(b.context === context && b.key === key));
    this.rebuildCache();
  }

  /** Set all user bindings at once. */
  setUserBindings(bindings: UserKeybinding[]): void {
    this.userBindings = bindings;
    this.rebuildCache();
  }

  /**
   * Resolve a key event to an action.
   *
   * Only currently active contexts participate in resolution. This avoids
   * ghost matches from inactive UI layers.
   */
  resolve(event: KeyCombo): string | undefined {
    for (const context of this.contextStack) {
      const sequences = this.parsedCache.get(context);
      if (!sequences) continue;

      for (const seq of sequences) {
        if (seq.combos.length === 1 && matchesKeyCombo(event, seq.combos[0])) {
          return seq.action;
        }
      }
    }

    return undefined;
  }

  /** Rebuild the parsed sequence cache for all contexts. */
  private rebuildCache(): void {
    this.parsedCache.clear();

    for (const block of this.defaultBlocks) {
      const mergedBindings: Record<string, string> = { ...block.bindings };

      for (const userBinding of this.userBindings) {
        if (userBinding.context === block.context) {
          mergedBindings[userBinding.key] = userBinding.action;
        }
      }

      const sequences: KeySequence[] = [];
      for (const [keyCombo, action] of Object.entries(mergedBindings)) {
        try {
          sequences.push(parseKeySequence({ key: keyCombo, action }));
        } catch {
          // Skip invalid key combos silently.
        }
      }

      this.parsedCache.set(block.context, sequences);
    }
  }

  /** Get all bindings for a specific context. */
  getBindingsForContext(context: KeybindingContextName): Record<string, string> {
    const sequences = this.parsedCache.get(context);
    if (!sequences) return {};

    const bindings: Record<string, string> = {};
    for (const seq of sequences) {
      const keyStr = seq.combos.map(formatCombo).join(' ');
      bindings[keyStr] = seq.action;
    }
    return bindings;
  }

  /** Get the key combo that triggers a specific action in a context. */
  getKeyForAction(context: KeybindingContextName, action: string): string | undefined {
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

function formatCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('ctrl');
  if (combo.shift) parts.push('shift');
  if (combo.meta) parts.push('meta');
  parts.push(combo.key);
  return parts.join('+');
}
