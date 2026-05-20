/**
 * Keybinding types — defines the data structures for the
 * context-based keybinding system.
 */

/** A keybinding context (e.g., "Global", "Chat", "Autocomplete") */
export type KeybindingContextName =
  | 'Global'
  | 'Chat'
  | 'Autocomplete'
  | 'Settings'
  | 'Confirmation'
  | 'Tabs'
  | 'Transcript'
  | 'HistorySearch'
  | 'Task'
  | 'ThemePicker'
  | 'ModelPicker'
  | 'Scroll'
  | 'Help'
  | 'Attachments'
  | 'Footer'
  | 'MessageSelector'
  | 'MessageActions'
  | 'DiffDialog'
  | 'Select'
  | 'Plugin';

/** A keybinding action identifier (e.g., "app:interrupt", "chat:submit") */
export type KeybindingAction = string;

/** A single key binding mapping a key to an action */
export interface KeyBindingEntry {
  /** Key combination (e.g., "ctrl+c", "shift+tab", "enter") */
  key: string;
  /** Action to trigger (e.g., "app:interrupt") */
  action: KeybindingAction;
}

/** A block of bindings for a specific context */
export interface KeybindingBlock {
  /** Context name */
  context: KeybindingContextName;
  /** Bindings for this context */
  bindings: Record<string, KeybindingAction>;
}

/** User-defined keybinding override */
export interface UserKeybinding {
  /** Context for this binding */
  context: KeybindingContextName;
  /** Key combination */
  key: string;
  /** Action to bind to */
  action: KeybindingAction;
}

/** User keybindings file format */
export interface UserKeybindingsFile {
  bindings: UserKeybinding[];
}