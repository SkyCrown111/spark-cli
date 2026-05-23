/**
 * Keybindings JSON schema — defines the schema for
 * ~/.spark/keybindings.json user configuration files.
 *
 * Used for validation and documentation. The schema describes
 * the expected structure: a `bindings` array of objects with
 * context, key, and action fields.
 */

import type { UserKeybinding, KeybindingContextName } from './types.js';

// ── Schema definition (JSON Schema compatible) ─────────

export const keybindingsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SparkCLI User Keybindings',
  description: 'Custom keybinding overrides for the SparkCLI REPL',
  type: 'object',
  required: ['bindings'],
  properties: {
    bindings: {
      type: 'array',
      description: 'List of keybinding overrides',
      items: {
        type: 'object',
        required: ['context', 'key', 'action'],
        properties: {
          context: {
            type: 'string',
            description: 'The keybinding context (e.g., "Chat", "Autocomplete")',
            enum: [
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
            ],
          },
          key: {
            type: 'string',
            description: 'Key combination (e.g., "ctrl+shift+e", "meta+p")',
            pattern: '^[a-zA-Z0-9+]+$',
          },
          action: {
            type: 'string',
            description: 'Action identifier (e.g., "chat:externalEditor", "app:redraw")',
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

// ── Example configuration ──────────────────────────────

export const exampleKeybindingsConfig: { bindings: UserKeybinding[] } = {
  bindings: [
    {
      context: 'Chat' as KeybindingContextName,
      key: 'ctrl+shift+e',
      action: 'chat:externalEditor',
    },
    {
      context: 'Scroll' as KeybindingContextName,
      key: 'ctrl+u',
      action: 'scroll:halfPageUp',
    },
    {
      context: 'Global' as KeybindingContextName,
      key: 'ctrl+shift+l',
      action: 'app:redraw',
    },
  ],
};

/**
 * Generate a default keybindings.json template for new users.
 */
export function generateTemplate(): string {
  const header = `// SparkCLI User Keybindings
// Place this file at ~/.spark/keybindings.json
// Override default keybindings by specifying context, key, and action.
// Reserved shortcuts (ctrl+c, ctrl+d) cannot be overridden.
//
// Available contexts: Global, Chat, Autocomplete, Settings, Confirmation,
//   Tabs, Transcript, HistorySearch, Task, ThemePicker, ModelPicker,
//   Scroll, Help, Attachments, Footer, MessageSelector, MessageActions,
//   DiffDialog, Select, Plugin
//
// Key format: ctrl+c, shift+tab, meta+p, ctrl+shift+e
// Chords: ctrl+x ctrl+k (press ctrl+x then ctrl+k)
`;

  const json = JSON.stringify(exampleKeybindingsConfig, null, 2);
  return header + json;
}
