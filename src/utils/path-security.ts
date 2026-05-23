/**
 * Centralized path validation for SparkCLI tools.
 *
 * Provides consistent path security checks across all file operations:
 * - Path traversal prevention (../ escapes)
 * - Absolute path control
 * - Quote stripping
 * - Windows/Unix path normalization
 *
 * Usage:
 *   import { validatePath } from '../utils/path-security.js';
 *   const result = validatePath(userPath, projectRoot);
 *   if (!result.ok) return { content: result.reason, isError: true };
 */

import { resolve, relative, isAbsolute, normalize } from 'node:path';
import { realpathSync } from 'node:fs';

export interface PathValidationResult {
  ok: boolean;
  resolved: string;
  relative: string;
  reason?: string;
}

export interface PathValidationOptions {
  /** Allow absolute paths (default: false). */
  allowAbsolute?: boolean;
  /** Allow paths that escape the project root (default: false). */
  allowOutside?: boolean;
}

/**
 * Validate a file path for security and correctness.
 *
 * Checks:
 * 1. Strips surrounding quotes (single or double)
 * 2. Normalizes path separators
 * 3. Handles Unix-style paths on Windows
 * 4. Prevents path traversal (../) unless allowOutside is set
 * 5. Rejects absolute paths unless allowAbsolute is set
 *
 * @param rawPath - The raw path string (possibly from user/model input)
 * @param projectRoot - The project root directory
 * @param options - Validation options
 * @returns Validation result with resolved path or error reason
 */
export function validatePath(
  rawPath: string,
  projectRoot: string,
  options: PathValidationOptions = {},
): PathValidationResult {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { ok: false, resolved: '', relative: '', reason: 'Path must be a non-empty string' };
  }

  // 1. Remove surrounding quotes
  let normalized = rawPath.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  // 2. Normalize path separators and remove ./  prefix
  normalized = normalized.replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);

  // 3. Handle Unix-style paths on Windows (e.g., "/assets/..." -> "assets/...")
  if (normalized.startsWith('/') && !/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.slice(1);
  }

  // 4. Normalize the path
  normalized = normalize(normalized);

  if (normalized.length === 0) {
    return { ok: false, resolved: '', relative: '', reason: 'Path must be a non-empty string' };
  }

  // 5. Resolve to absolute path
  const resolvedPath = isAbsolute(normalized) ? normalized : resolve(projectRoot, normalized);

  // 6. Resolve symlinks for security (tolerate ENOENT)
  let realResolved = resolvedPath;
  try {
    realResolved = realpathSync(resolvedPath);
  } catch {
    // Path doesn't exist yet; use the unresolved path
  }

  // 7. Get relative path for validation
  const relPath = relative(projectRoot, realResolved);

  // 8. Check for path traversal
  if (relPath.startsWith('..') && !options.allowOutside) {
    return {
      ok: false,
      resolved: realResolved,
      relative: relPath,
      reason: 'Path escapes project root. Use allowOutside option if needed.',
    };
  }

  // 9. Check absolute path permission
  if (isAbsolute(rawPath) && !options.allowAbsolute) {
    return {
      ok: false,
      resolved: realResolved,
      relative: relPath,
      reason: 'Absolute paths are not allowed. Use allowAbsolute option if needed.',
    };
  }

  return { ok: true, resolved: realResolved, relative: relPath };
}

/**
 * Quick validation that throws SparkCLIError on failure.
 * Use when you want to fail fast with a clear error message.
 */
export function validatePathOrThrow(
  rawPath: string,
  projectRoot: string,
  options: PathValidationOptions = {},
): { resolved: string; relative: string } {
  const result = validatePath(rawPath, projectRoot, options);
  if (!result.ok) {
    throw new Error(`Invalid path "${rawPath}": ${result.reason}`);
  }
  return { resolved: result.resolved, relative: result.relative };
}
