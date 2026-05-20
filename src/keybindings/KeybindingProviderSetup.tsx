/**
 * KeybindingProviderSetup — wraps the app with KeybindingProvider
 * and a global useInput handler that resolves and dispatches
 * keybinding actions.
 *
 * This is the "setup" layer that connects Ink's input system
 * to the keybinding resolver. It should wrap the entire REPL
 * tree so that all key events flow through the resolver.
 */

import React, { useCallback } from 'react';
import { useInput } from 'ink';
import { KeybindingProvider, useKeybindingContext } from './KeybindingContext.js';

// ── Global input handler ───────────────────────────────

/**
 * GlobalKeyHandler — sits inside the KeybindingProvider and
 * uses Ink's useInput to capture all keyboard events.
 *
 * Each key event is resolved through the KeybindingResolver
 * and, if a matching action is found, dispatched to the
 * registered handlers.
 *
 * This component must be rendered INSIDE KeybindingProvider
 * so it can access the context.
 */
const GlobalKeyHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { resolveKeyEvent, dispatchAction } = useKeybindingContext();

  useInput(useCallback((input: string, key: any) => {
    // Resolve the key event to an action
    const action = resolveKeyEvent(input, key);

    // If an action was found, dispatch it
    if (action) {
      dispatchAction(action);
    }
  }, [resolveKeyEvent, dispatchAction]));

  return <>{children}</>;
};

// ── Provider setup ─────────────────────────────────────

export interface KeybindingProviderSetupProps {
  children: React.ReactNode;
}

/**
 * KeybindingProviderSetup — the outer wrapper that sets up
 * both the KeybindingProvider context and the global input handler.
 *
 * Usage:
 * ```tsx
 * <KeybindingProviderSetup>
 *   <REPL />
 * </KeybindingProviderSetup>
 * ```
 */
export const KeybindingProviderSetup: React.FC<KeybindingProviderSetupProps> = ({ children }) => {
  return (
    <KeybindingProvider>
      <GlobalKeyHandler>
        {children}
      </GlobalKeyHandler>
    </KeybindingProvider>
  );
};