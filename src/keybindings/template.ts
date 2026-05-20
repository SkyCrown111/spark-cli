/**
 * Template utilities — helper functions for generating
 * keybinding configuration templates and documentation.
 */

import type { KeybindingContextName } from './types.js';
import { getDefaultKeybindings, getAllActions } from './defaultBindings.js';
import { formatShortcut } from './shortcutFormat.js';

/**
 * Generate a markdown-formatted table of all default keybindings.
 * Useful for help displays and documentation.
 */
export function generateKeybindingTable(): string {
  const blocks = getDefaultKeybindings();
  const lines: string[] = [];

  lines.push('| Context | Key | Action |');
  lines.push('|---------|-----|--------|');

  for (const block of blocks) {
    for (const [keyCombo, action] of Object.entries(block.bindings)) {
      lines.push(`| ${block.context} | ${formatShortcut(keyCombo)} | ${action} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a list of all available action identifiers.
 * Useful for validation hints and help documentation.
 */
export function generateActionList(): string {
  const actions = getAllActions();
  return actions.map((a) => `- ${a}`).join('\n');
}

/**
 * Generate a list of all available context names.
 */
export function generateContextList(): string {
  const contexts: KeybindingContextName[] = [
    'Global', 'Chat', 'Autocomplete', 'Settings', 'Confirmation',
    'Tabs', 'Transcript', 'HistorySearch', 'Task', 'ThemePicker',
    'ModelPicker', 'Scroll', 'Help', 'Attachments', 'Footer',
    'MessageSelector', 'MessageActions', 'DiffDialog', 'Select', 'Plugin',
  ];
  return contexts.map((c) => `- ${c}`).join('\n');
}