/**
 * Load user keybindings — reads and validates user-defined
 * keybinding overrides from ~/.spark-cli/keybindings.json.
 */

import fs from 'fs';
import path from 'path';
import type { UserKeybinding, UserKeybindingsFile } from './types.js';
import { validateUserBindings, type ValidationResult } from './validate.js';
import { getGlobalConfigDir } from '../config/paths.js';

// ── Constants ──────────────────────────────────────────

const KEYBINDINGS_FILENAME = 'keybindings.json';

// ── Loading ────────────────────────────────────────────

/**
 * Get the path to the user keybindings file.
 */
export function getKeybindingsPath(): string {
  return path.join(getGlobalConfigDir(), KEYBINDINGS_FILENAME);
}

/**
 * Load user keybindings from the config file.
 *
 * Returns:
 *  - bindings: the parsed user bindings
 *  - validation: the validation result
 *  - error: any file read/parse error
 *
 * If the file doesn't exist, returns empty bindings with no issues.
 * If the file has parse errors, returns empty bindings with an error issue.
 */
export function loadUserBindings(): {
  bindings: UserKeybinding[];
  validation: ValidationResult;
  error?: string;
} {
  const filePath = getKeybindingsPath();

  // File doesn't exist — that's fine, no user overrides
  if (!fs.existsSync(filePath)) {
    return {
      bindings: [],
      validation: { valid: true, issues: [] },
    };
  }

  // Read and parse
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    // Strip JSONC comments (// lines)
    const stripped = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    const parsed: UserKeybindingsFile = JSON.parse(stripped);

    if (!parsed.bindings || !Array.isArray(parsed.bindings)) {
      return {
        bindings: [],
        validation: {
          valid: false,
          issues: [{
            severity: 'error',
            message: 'keybindings.json must have a "bindings" array',
          }],
        },
        error: 'Invalid format: missing "bindings" array',
      };
    }

    // Validate
    const validation = validateUserBindings(parsed.bindings);

    return {
      bindings: parsed.bindings,
      validation,
    };
  } catch (e: any) {
    return {
      bindings: [],
      validation: {
        valid: false,
        issues: [{
          severity: 'error',
          message: `Failed to parse keybindings.json: ${e.message}`,
        }],
      },
      error: e.message,
    };
  }
}

/**
 * Save user keybindings to the config file.
 */
export function saveUserBindings(bindings: UserKeybinding[]): void {
  const filePath = getKeybindingsPath();
  const configDir = path.dirname(filePath);

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const content: UserKeybindingsFile = { bindings };
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
}

/**
 * Check if a user keybindings file exists.
 */
export function userKeybindingsFileExists(): boolean {
  return fs.existsSync(getKeybindingsPath());
}