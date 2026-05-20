/**
 * useKeybinding / useKeybindings — React hooks for binding
 * keyboard actions to handler functions.
 *
 * useKeybinding: register a single action handler
 * useKeybindings: register multiple action handlers at once
 * useRegisterKeybindingContext: activate/deactivate a context
 */

import { useEffect } from 'react';
import { useKeybindingContext } from './KeybindingContext.js';
import type { KeybindingContextName } from './types.js';

// ── Single action binding ──────────────────────────────

/**
 * Register a handler for a single keybinding action.
 *
 * The handler is automatically registered on mount and
 * unregistered on unmount. If the component is not inside
 * a KeybindingProvider, this hook is a no-op.
 *
 * @param action - The action identifier (e.g., "app:interrupt")
 * @param handler - The callback to invoke when the action triggers
 * @param enabled - Whether this binding is active (default: true)
 */
export function useKeybinding(
  action: string,
  handler: () => void,
  enabled = true,
): void {
  const ctx = useKeybindingContext();

  useEffect(() => {
    if (!enabled) return;

    ctx.registerActionHandler(action, handler);
    return () => {
      ctx.unregisterActionHandler(action, handler);
    };
  }, [action, handler, enabled, ctx]);
}

// ── Multiple action bindings ───────────────────────────

export interface ActionBinding {
  /** Action identifier */
  action: string;
  /** Handler function */
  handler: () => void;
}

/**
 * Register handlers for multiple keybinding actions at once.
 *
 * @param bindings - Array of action/handler pairs
 * @param enabled - Whether all bindings are active (default: true)
 */
export function useKeybindings(
  bindings: ActionBinding[],
  enabled = true,
): void {
  const ctx = useKeybindingContext();

  useEffect(() => {
    if (!enabled) return;

    for (const { action, handler } of bindings) {
      ctx.registerActionHandler(action, handler);
    }

    return () => {
      for (const { action, handler } of bindings) {
        ctx.unregisterActionHandler(action, handler);
      }
    };
  }, [bindings, enabled, ctx]);
}

// ── Context registration ──────────────────────────────

/**
 * Register a keybinding context as active while the component
 * is mounted. The context is pushed on mount and popped on unmount.
 *
 * @param context - The context name (e.g., "Autocomplete")
 * @param enabled - Whether the context should be active (default: true)
 */
export function useRegisterKeybindingContext(
  context: KeybindingContextName,
  enabled = true,
): void {
  const ctx = useKeybindingContext();

  useEffect(() => {
    if (!enabled) return;

    ctx.registerContext(context);
    return () => {
      ctx.unregisterContext(context);
    };
  }, [context, enabled, ctx]);
}