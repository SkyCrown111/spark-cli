/**
 * Keybinding validation — validates user-defined keybinding
 * overrides against reserved shortcuts, conflicts, and
 * format correctness.
 */

import type { UserKeybinding } from './types.js';
import { isReserved } from './reservedShortcuts.js';
import { parseKeyCombo } from './parser.js';
import { getAllActions } from './defaultBindings.js';

// ── Validation result ──────────────────────────────────

export interface ValidationIssue {
  /** Issue severity */
  severity: 'error' | 'warning';
  /** Human-readable description */
  message: string;
  /** The binding that caused the issue */
  binding?: UserKeybinding;
}

export interface ValidationResult {
  /** Whether all bindings are valid (no errors) */
  valid: boolean;
  /** List of issues found */
  issues: ValidationIssue[];
}

// ── Validation ─────────────────────────────────────────

/**
 * Validate a list of user keybinding overrides.
 *
 * Checks for:
 *  - Reserved shortcuts (Ctrl+C, Ctrl+D) cannot be overridden
 *  - Invalid key combo format (unparseable strings)
 *  - Unknown actions (not in the default action set)
 *  - Unknown context names
 *  - Conflicting bindings (same key in same context bound to different actions)
 */
export function validateUserBindings(bindings: UserKeybinding[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const knownActions = new Set(getAllActions());
  const knownContexts: Set<string> = new Set([
    'Global',
    'Chat',
    'Autocomplete',
    'Settings',
    'Confirmation',
    'Tabs',
    'Transcript',
    'HistorySearch',
    'Task',
    'ThemePicker',
    'ModelPicker',
    'Scroll',
    'Help',
    'Attachments',
    'Footer',
    'MessageSelector',
    'MessageActions',
    'DiffDialog',
    'Select',
    'Plugin',
  ]);

  // Track per-context key assignments for conflict detection
  const contextKeyMap = new Map<string, Map<string, string>>();

  for (const binding of bindings) {
    // 1. Check reserved shortcuts
    if (isReserved(binding.key)) {
      issues.push({
        severity: 'error',
        message: `Cannot override reserved shortcut "${binding.key}"`,
        binding,
      });
      continue;
    }

    // 2. Check key combo format
    try {
      parseKeyCombo(binding.key);
    } catch (e: any) {
      issues.push({
        severity: 'error',
        message: `Invalid key combo "${binding.key}": ${e.message}`,
        binding,
      });
      continue;
    }

    // 3. Check known context
    if (!knownContexts.has(binding.context)) {
      issues.push({
        severity: 'warning',
        message: `Unknown context "${binding.context}" — binding may not activate`,
        binding,
      });
    }

    // 4. Check known action
    if (!knownActions.has(binding.action)) {
      issues.push({
        severity: 'warning',
        message: `Unknown action "${binding.action}" — no handler may be registered`,
        binding,
      });
    }

    // 5. Check conflicts within same context
    const ctxMap = contextKeyMap.get(binding.context) ?? new Map<string, string>();
    const existingAction = ctxMap.get(binding.key);
    if (existingAction && existingAction !== binding.action) {
      issues.push({
        severity: 'warning',
        message: `Conflict: "${binding.key}" in ${binding.context} already bound to "${existingAction}", now also "${binding.action}"`,
        binding,
      });
    }
    ctxMap.set(binding.key, binding.action);
    contextKeyMap.set(binding.context, ctxMap);
  }

  return {
    valid: issues.every((i) => i.severity !== 'error'),
    issues,
  };
}
