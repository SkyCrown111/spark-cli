/**
 * Unified logger for SparkCLI.
 *
 * Provides leveled logging (debug/info/warn/error) with consistent formatting.
 * Controlled by the --verbose flag or logger.setLevel().
 *
 * Usage:
 *   import { logger } from '../utils/logger.js';
 *   logger.info(chalk.green('✓ Done'));
 *   logger.debug('Loading config from', path);
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

class Logger {
  private level: LogLevel = 'info';
  private _jsonMode = false;

  /** Set the minimum log level. Messages below this level are suppressed. */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Get the current log level. */
  getLevel(): LogLevel {
    return this.level;
  }

  /** Enable JSON mode (suppresses all non-error output). */
  setJsonMode(enabled: boolean): void {
    this._jsonMode = enabled;
  }

  /** Debug-level output (only shown with --verbose). */
  debug(...args: unknown[]): void {
    if (this.shouldLog('debug') && !this._jsonMode) {
      console.log(chalk.dim('[debug]'), ...args);
    }
  }

  /** Info-level output (default for user-visible messages). */
  info(...args: unknown[]): void {
    if (this.shouldLog('info') && !this._jsonMode) {
      console.log(...args);
    }
  }

  /** Warning-level output. */
  warn(...args: unknown[]): void {
    if (this.shouldLog('warn') && !this._jsonMode) {
      console.log(chalk.yellow('[warn]'), ...args);
    }
  }

  /** Error-level output (always shown unless in JSON mode). */
  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      if (this._jsonMode) {
        // In JSON mode, errors go to stderr as structured JSON
        console.error(JSON.stringify({ error: args.map(String).join(' ') }));
      } else {
        console.error(chalk.red('[error]'), ...args);
      }
    }
  }

  /** Output JSON data (for --json mode). */
  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(this.level);
  }
}

/** Singleton logger instance. */
export const logger = new Logger();
