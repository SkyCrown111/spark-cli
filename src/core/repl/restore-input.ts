/**
 * Restore REPL stdin + input box after agent turns, modals, or readline prompts.
 */

import * as readline from 'node:readline';
import { stdin as input } from 'node:process';
import type { InputBox } from './input-box.js';
import { clearReplModalHandler } from './repl-prompt-bridge.js';
import { showReplCursor } from './viewport.js';

/** Re-enable raw keypress routing and the input box after modals or errors. */
export function restoreReplInput(inputBox: InputBox): void {
  clearReplModalHandler();
  ensureRawStdin();
  if (!inputBox.isVisible) {
    inputBox.show();
  }
  showReplCursor();
}

export function ensureRawStdin(): void {
  if (typeof input.setRawMode === 'function' && input.isTTY) {
    input.setRawMode(true);
    readline.emitKeypressEvents(input);
  }
}
