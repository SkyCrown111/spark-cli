/**
 * Prompt editor — edit prompt in external editor ($EDITOR).
 *
 * Launches the user's configured editor (vim, nano, code, etc.)
 * with a temporary file containing the current prompt text.
 * When the editor closes, reads the file and returns the edited text.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Edit a prompt string in the user's external editor.
 *
 * @param currentPrompt - The current prompt text to edit
 * @returns The edited prompt text, or undefined if editing failed/cancelled
 */
export function editPromptInEditor(currentPrompt: string): string | undefined {
  // Determine editor
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'vim';

  // Create temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `spark-cli-prompt-${Date.now()}.txt`);

  try {
    // Write current prompt to temp file
    fs.writeFileSync(tmpFile, currentPrompt, 'utf-8');

    // Launch editor
    const result = spawnSync(editor, [tmpFile], {
      stdio: 'inherit',
      timeout: 300000, // 5 minute timeout
    });

    // Check if editor exited normally
    if (result.error || result.status !== 0) {
      return undefined;
    }

    // Read edited content
    const edited = fs.readFileSync(tmpFile, 'utf-8').trim();

    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }

    // Return edited text (skip if empty = user cancelled)
    return edited || undefined;
  } catch {
    // Clean up on error
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore
    }
    return undefined;
  }
}