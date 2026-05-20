/**
 * Terminal state management.
 *
 * Tracks terminal-specific state like focus, size changes,
 * and platform-specific quirks. Provides a central source for
 * terminal-related decisions throughout the app.
 */

import { getTerminalCapabilities, type TerminalCapabilities } from './terminal-querier.js';

export interface TerminalState {
  capabilities: TerminalCapabilities;
  focused: boolean;
}

/**
 * Get the initial terminal state.
 */
export function createTerminalState(): TerminalState {
  return {
    capabilities: getTerminalCapabilities(),
    focused: true, // Assume focused on start
  };
}

/**
 * Check if we're running on Windows.
 */
export function isWindows(): boolean {
  return getTerminalCapabilities().platform === 'windows';
}

/**
 * Check if shift+tab works reliably on this terminal.
 * Windows Terminal without VT mode may not handle modifier-only chords.
 */
export function shiftTabReliable(): boolean {
  const cap = getTerminalCapabilities();
  if (cap.platform === 'windows') {
    return cap.supportsVTMode || cap.supportsKittyProtocol;
  }
  return true;
}

/**
 * Get the image paste key for this platform.
 * Windows: alt+v (ctrl+v is system paste)
 * Others: ctrl+v
 */
export function getImagePasteKey(): string {
  return isWindows() ? 'alt+v' : 'ctrl+v';
}

/**
 * Get the mode cycle key for this platform.
 * Windows without VT: meta+m
 * Others: shift+tab
 */
export function getModeCycleKey(): string {
  return shiftTabReliable() ? 'shift+tab' : 'meta+m';
}