/**
 * Custom React Hooks
 * 
 * This module exports custom hooks for the SparkCLI REPL interface.
 */

export { useTerminalSize } from './useTerminalSize.js';
export type { TerminalSize } from './useTerminalSize.js';

export { useKeybindings, commonKeybindings } from './useKeybindings.js';
export type { KeyBinding, UseKeybindingsOptions } from './useKeybindings.js';

export { useMessages } from './useMessages.js';
export type { UseMessagesOptions, UseMessagesReturn } from './useMessages.js';

export { useInputHistory } from './useInputHistory.js';
export type { UseInputHistoryOptions, UseInputHistoryReturn } from './useInputHistory.js';
