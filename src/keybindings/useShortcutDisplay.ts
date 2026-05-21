/**
 * useShortcutDisplay — React hook for displaying dynamic
 * shortcut hints based on the current active context.
 *
 * Returns the shortcuts that should be shown in the footer
 * for the currently active context, formatted for display.
 */

import { useMemo } from 'react';
import { useKeybindingContext } from './KeybindingContext.js';
import { formatShortcut } from './shortcutFormat.js';
import type { KeybindingContextName } from './types.js';

// ── Hint display ───────────────────────────────────────

export interface ShortcutHint {
  /** Formatted key combo for display (e.g., "Ctrl+C") */
  key: string;
  /** Action description */
  description: string;
  /** Whether this hint is currently active/contextual */
  active: boolean;
}

// ── Action description map ────────────────────────────

const ACTION_DESCRIPTIONS: Record<string, string> = {
  'app:interrupt':        'interrupt',
  'app:exit':             'exit',
  'app:redraw':           'clear',
  'app:toggleTodos':      'todos',
  'app:toggleTranscript': 'transcript',
  'app:cancel':           'cancel',
  'chat:submit':          'submit',
  'chat:cycleMode':       'switch mode',
  'chat:modelPicker':     'model picker',
  'chat:externalEditor':  'editor',
  'chat:stash':           'stash',
  'chat:imagePaste':      'paste image',
  'scroll:pageUp':        'page up',
  'scroll:pageDown':      'page down',
  'scroll:top':           'top',
  'scroll:bottom':        'bottom',
  'scroll:lineUp':        'line up',
  'scroll:lineDown':      'line down',
  'selection:copy':       'copy',
  'autocomplete:accept':  'accept',
  'autocomplete:dismiss': 'dismiss',
  'confirm:yes':          'yes',
  'confirm:no':           'no',
  'select:previous':      'previous',
  'select:next':          'next',
  'select:accept':        'select',
  'select:cancel':        'cancel',
  'historySearch:next':   'next match',
  'historySearch:accept': 'accept',
  'historySearch:dismiss': 'dismiss',
  'settings:close':       'close',
  'settings:navigateUp':  'navigate up',
  'settings:navigateDown':'navigate down',
  'settings:toggle':      'toggle',
  'footer:showKeybindings':'all shortcuts',
};

/**
 * Get a human-readable description for a keybinding action.
 */
function getDescription(action: string): string {
  return ACTION_DESCRIPTIONS[action] ?? action;
}

// ── Hook ──────────────────────────────────────────────

/**
 * Get shortcut hints for display in the footer/status area.
 *
 * @param context - The context to show hints for (default: current active context)
 * @param maxHints - Maximum number of hints to return (default: 6)
 * @returns Array of formatted shortcut hints
 */
export function useShortcutDisplay(
  context?: KeybindingContextName,
  maxHints = 6,
): ShortcutHint[] {
  const { resolver } = useKeybindingContext();

  return useMemo(() => {
    const targetContext = context ?? resolver.getActiveContext();
    const bindings = resolver.getBindingsForContext(targetContext);

    // Also include Global bindings
    const globalBindings = resolver.getBindingsForContext('Global');

    // Merge: context-specific first, then global
    const allBindings = { ...globalBindings, ...bindings };

    const hints: ShortcutHint[] = [];
    for (const [keyCombo, action] of Object.entries(allBindings)) {
      if (hints.length >= maxHints) break;

      // Skip image paste key on Windows (not intuitive)
      if (action === 'chat:imagePaste') continue;

      hints.push({
        key: formatShortcut(keyCombo),
        description: getDescription(action),
        active: true, // All shown hints are "active" in current context
      });
    }

    return hints;
  }, [context, resolver, maxHints]);
}