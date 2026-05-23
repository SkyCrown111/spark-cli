/**
 * KeybindingContext — React Context for the keybinding system.
 *
 * Provides the KeybindingResolver and context registration to
 * all components in the tree. Components can:
 *  - Register/unregister their active context via useRegisterKeybindingContext
 *  - Listen for resolved actions via useKeybindingAction
 *  - Display current shortcut hints via useShortcutDisplay
 */

import React, { createContext, useContext, useRef, useCallback } from 'react';
import { logger } from '../utils/logger.js';
import type { KeybindingContextName } from './types.js';
import { KeybindingResolver } from './resolver.js';
import { loadUserBindings } from './loadUserBindings.js';
import { inkEventToKeyCombo } from './match.js';
import type { InkKeyEvent } from './match.js';

// ── Context value ──────────────────────────────────────

export interface KeybindingContextValue {
  /** The resolver instance */
  resolver: KeybindingResolver;
  /** Register a context as active */
  registerContext: (context: KeybindingContextName) => void;
  /** Unregister a context */
  unregisterContext: (context: KeybindingContextName) => void;
  /** Resolve a key event to an action */
  resolveKeyEvent: (input: string, key: InkKeyEvent) => string | undefined;
  /** Dispatch an action to registered handlers */
  dispatchAction: (action: string) => boolean;
  /** Register an action handler */
  registerActionHandler: (action: string, handler: () => void) => void;
  /** Unregister an action handler */
  unregisterActionHandler: (action: string, handler: () => void) => void;
}

// ── React Context ──────────────────────────────────────

const KeybindingCtx = createContext<KeybindingContextValue | null>(null);

/**
 * Use the keybinding context value.
 * Throws if used outside KeybindingProviderSetup.
 */
export function useKeybindingContext(): KeybindingContextValue {
  const ctx = useContext(KeybindingCtx);
  if (!ctx) {
    throw new Error('useKeybindingContext must be used inside KeybindingProviderSetup');
  }
  return ctx;
}

// ── Provider ───────────────────────────────────────────

export interface KeybindingProviderProps {
  children: React.ReactNode;
}

/**
 * Create a KeybindingResolver with user bindings loaded.
 */
function createResolver(): KeybindingResolver {
  const { bindings, validation } = loadUserBindings();

  // Log validation warnings
  if (validation.issues.length > 0) {
    for (const issue of validation.issues) {
      if (issue.severity === 'error') {
        logger.error(`Keybinding error: ${issue.message}`);
      } else {
        logger.warn(`Keybinding warning: ${issue.message}`);
      }
    }
  }

  return new KeybindingResolver(undefined, bindings);
}

/**
 * KeybindingProvider — wraps the app and provides the resolver
 * and context registration to all children.
 *
 * Loads user keybindings on mount and sets up the resolver.
 */
export const KeybindingProvider: React.FC<KeybindingProviderProps> = ({ children }) => {
  // Initialize resolver — useRef initializer is called once
  const resolverRef = useRef<KeybindingResolver>(null);
  if (resolverRef.current === null) {
    resolverRef.current = createResolver();
  }
  const resolver = resolverRef.current;

  // Action handlers registry
  const handlersRef = useRef<Map<string, Set<() => void>>>(new Map());

  const registerContext = useCallback(
    (context: KeybindingContextName) => {
      resolver.pushContext(context);
    },
    [resolver],
  );

  const unregisterContext = useCallback(
    (context: KeybindingContextName) => {
      resolver.popContext(context);
    },
    [resolver],
  );

  const resolveKeyEvent = useCallback(
    (input: string, key: InkKeyEvent): string | undefined => {
      const event = inkEventToKeyCombo(input, key);
      return resolver.resolve(event);
    },
    [resolver],
  );

  const dispatchAction = useCallback((action: string): boolean => {
    const handlers = handlersRef.current.get(action);
    if (!handlers || handlers.size === 0) return false;

    // Call all registered handlers for this action
    for (const handler of handlers) {
      handler();
    }
    return true;
  }, []);

  const registerActionHandler = useCallback((action: string, handler: () => void) => {
    const existing = handlersRef.current.get(action) ?? new Set();
    existing.add(handler);
    handlersRef.current.set(action, existing);
  }, []);

  const unregisterActionHandler = useCallback((action: string, handler: () => void): void => {
    const existing = handlersRef.current.get(action);
    if (existing) {
      existing.delete(handler);
      if (existing.size === 0) {
        handlersRef.current.delete(action);
      }
    }
  }, []);

  const value: KeybindingContextValue = {
    resolver,
    registerContext,
    unregisterContext,
    resolveKeyEvent,
    dispatchAction,
    registerActionHandler,
    unregisterActionHandler,
  };

  return <KeybindingCtx.Provider value={value}>{children}</KeybindingCtx.Provider>;
};
