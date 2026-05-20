/**
 * ErrorLogger - Writes error details to a log file
 * Persists error information for debugging and post-mortem analysis.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ErrorInfo } from 'react';

/** Resolve the error log directory inside .spark-cli/ */
function getErrorLogDir(projectRoot?: string): string {
  const base = projectRoot ?? process.cwd();
  const dir = join(base, '.spark-cli', 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Format an error + React error info into a structured log entry */
function formatErrorEntry(error: Error, info?: ErrorInfo): string {
  const timestamp = new Date().toISOString();
  const lines = [
    `--- [${timestamp}] ---`,
    `Error: ${error.name}: ${error.message}`,
    `Stack: ${error.stack ?? '(no stack)'}`,
  ];
  if (info?.componentStack) {
    lines.push(`ComponentStack: ${info.componentStack}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Write an error to the log file.
 *
 * @param error - The caught error
 * @param info - React ErrorInfo (optional, from ErrorBoundary)
 * @param projectRoot - Project root for log file location
 */
export function writeErrorLog(error: Error, info?: ErrorInfo, projectRoot?: string): void {
  try {
    const dir = getErrorLogDir(projectRoot);
    const logFile = join(dir, 'errors.log');
    const entry = formatErrorEntry(error, info);

    // Append to existing log or create new
    writeFileSync(logFile, entry, { flag: 'a' });
  } catch {
    // Silently fail — error logging shouldn't crash the app
  }
}

/**
 * Read recent error log entries.
 *
 * @param projectRoot - Project root for log file location
 * @param limit - Max number of entries to return (default: 20)
 * @returns Array of log entry strings
 */
export function readErrorLog(projectRoot?: string, limit = 20): string[] {
  try {
    const dir = getErrorLogDir(projectRoot);
    const logFile = join(dir, 'errors.log');
    if (!existsSync(logFile)) return [];

    const raw = readFileSync(logFile, 'utf8');

    const entries = raw.split('--- [').filter(Boolean);
    return entries.slice(-limit).map((e) => `--- [${e}`);
  } catch {
    return [];
  }
}