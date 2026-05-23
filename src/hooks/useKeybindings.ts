/**
 * useKeybindings hook - Keyboard shortcut management (compatibility layer)
 *
 * This is the original simple keybinding system. It remains available
 * for components that don't need context-based keybinding resolution.
 *
 * For context-aware keybindings, use the new system from
 * `../keybindings/useKeybinding.js` instead.
 *
 * This module delegates to Ink's useInput directly — it does NOT
 * go through the KeybindingResolver. This allows simple components
 * to continue working without the full keybinding context system.
 */

import { useInput } from 'ink';
import { useCallback } from 'react';

export interface KeyBinding {
  /** Key combination (e.g., 'c' for Ctrl+C) */
  key: string;
  /** Whether Ctrl key is required */
  ctrl?: boolean;
  /** Whether Shift key is required */
  shift?: boolean;
  /** Whether Alt/Meta key is required */
  meta?: boolean;
  /** Handler function to call when key is pressed */
  handler: () => void;
  /** Description of what this keybinding does */
  description?: string;
}

export interface UseKeybindingsOptions {
  /** Array of keybindings to register */
  bindings: KeyBinding[];
  /** Whether keybindings are enabled */
  enabled?: boolean;
}

/**
 * Hook to manage keyboard shortcuts (simple, context-less mode).
 *
 * Provides a declarative way to register keyboard shortcuts with
 * support for modifier keys (Ctrl, Shift, Alt/Meta).
 *
 * For context-aware keybindings, use useKeybinding/useKeybindings
 * from the keybinding system instead.
 *
 * @param options - Keybinding configuration
 *
 * @example
 * ```tsx
 * useKeybindings({
 *   bindings: [
 *     {
 *       key: 'c',
 *       ctrl: true,
 *       handler: () => handleInterrupt(),
 *       description: 'Interrupt current operation'
 *     },
 *     {
 *       key: 'd',
 *       ctrl: true,
 *       handler: () => handleExit(),
 *       description: 'Exit REPL'
 *     },
 *     {
 *       key: 'l',
 *       ctrl: true,
 *       handler: () => handleClear(),
 *       description: 'Clear screen'
 *     }
 *   ],
 *   enabled: true
 * });
 * ```
 */
export const useKeybindings = ({ bindings, enabled = true }: UseKeybindingsOptions): void => {
  const handleInput = useCallback(
    (input: string, key: any) => {
      if (!enabled) return;

      // Find matching keybinding
      for (const binding of bindings) {
        const ctrlMatch = binding.ctrl === undefined || binding.ctrl === key.ctrl;
        const shiftMatch = binding.shift === undefined || binding.shift === key.shift;
        const metaMatch = binding.meta === undefined || binding.meta === key.meta;
        const keyMatch = input === binding.key;

        if (ctrlMatch && shiftMatch && metaMatch && keyMatch) {
          binding.handler();
          return;
        }
      }
    },
    [bindings, enabled],
  );

  useInput(handleInput);
};

/**
 * Common keybinding presets
 */
export const commonKeybindings = {
  /** Ctrl+C - Interrupt */
  interrupt: (handler: () => void): KeyBinding => ({
    key: 'c',
    ctrl: true,
    handler,
    description: 'Interrupt current operation',
  }),

  /** Ctrl+D - Exit */
  exit: (handler: () => void): KeyBinding => ({
    key: 'd',
    ctrl: true,
    handler,
    description: 'Exit REPL',
  }),

  /** Ctrl+L - Clear screen */
  clear: (handler: () => void): KeyBinding => ({
    key: 'l',
    ctrl: true,
    handler,
    description: 'Clear screen',
  }),

  /** Tab - Autocomplete */
  autocomplete: (handler: () => void): KeyBinding => ({
    key: 'tab',
    handler,
    description: 'Autocomplete',
  }),

  /** Shift+Tab - Cycle mode */
  cycleMode: (handler: () => void): KeyBinding => ({
    key: 'tab',
    shift: true,
    handler,
    description: 'Cycle input mode',
  }),
};
