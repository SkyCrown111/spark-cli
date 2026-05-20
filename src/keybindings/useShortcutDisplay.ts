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
  'app:interrupt':        'Interrupt',
  'app:exit':             'Exit',
  'app:redraw':           'Clear',
  'app:toggleTodos':      'Todos',
  'app:toggleTranscript': 'Transcript',
  'app:cancel':           'Cancel',
  'chat:submit':          'Submit',
  'chat:cycleMode':       'Switch mode',
  'chat:modelPicker':     'Model picker',
  'chat:externalEditor':  'Editor',
  'chat:stash':           'Stash',
  'chat:imagePaste':      'Paste image',
  'scroll:pageUp':        'Page up',
  'scroll:pageDown':      'Page down',
  'scroll:top':           'Top',
  'scroll:bottom':        'Bottom',
  'scroll:lineUp':        'Line up',
  'scroll:lineDown':      'Line down',
  'selection:copy':       'Copy',
  'autocomplete:accept':  'Accept',
  'autocomplete:dismiss': 'Dismiss',
  'confirm:yes':          'Yes',
  'confirm:no':           'No',
  'select:previous':      'Previous',
  'select:next':          'Next',
  'select:accept':        'Select',
  'select:cancel':        'Cancel',
  'historySearch:next':   'Next match',
  'historySearch:accept': 'Accept',
  'historySearch:dismiss': 'Dismiss',
  'settings:close':       'Close',
  'settings:navigateUp':  'Navigate up',
  'settings:navigateDown':'Navigate down',
  'settings:toggle':      'Toggle',
  'footer:showKeybindings':'All shortcuts',
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