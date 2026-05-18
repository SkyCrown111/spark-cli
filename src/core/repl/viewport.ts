/**
 * TTY viewport helpers for the REPL.
 *
 * Default: main terminal buffer so mouse wheel / scrollback works.
 * Opt-in alternate screen via SPARK_CLI_ALT_SCREEN=1 (disables scrollback in most hosts).
 */

import * as readline from 'node:readline';

/**
 * Use DEC alternate screen (1049). Off by default — alt buffer has no scrollback,
 * so the mouse wheel cannot review earlier agent output.
 */
export function shouldUseAlternateScreen(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.SPARK_CLI_NO_ALT_SCREEN === '1') return false;
  return process.env.SPARK_CLI_ALT_SCREEN === '1';
}

/** @deprecated use shouldUseAlternateScreen */
export const supportsAlternateScreen = shouldUseAlternateScreen;

/** Clear the visible viewport only (keeps scrollback for mouse wheel). */
export function clearTtyViewport(stdout: NodeJS.WriteStream = process.stdout): void {
  if (!stdout.isTTY) return;
  stdout.write('\x1b[H\x1b[2J');
  try {
    readline.cursorTo(stdout, 0, 0);
    readline.clearScreenDown(stdout);
  } catch {
    /* readline clear optional */
  }
}

/** Show the terminal caret (DECSCUSR on). */
export function showReplCursor(stdout: NodeJS.WriteStream = process.stdout): void {
  if (!stdout.isTTY) return;
  stdout.write('\x1b[?25h');
}

/** Hide the terminal caret (e.g. while a spinner runs). */
export function hideReplCursor(stdout: NodeJS.WriteStream = process.stdout): void {
  if (!stdout.isTTY) return;
  stdout.write('\x1b[?25l');
}

/** Write a line to stdout (avoid console.log in raw / alt-screen REPL). */
export function writeReplLine(line: string, stdout: NodeJS.WriteStream = process.stdout): void {
  stdout.write(`${line}\n`);
}

/** Write a multi-line block (no trailing extra newline). */
export function writeReplBlock(text: string, stdout: NodeJS.WriteStream = process.stdout): void {
  if (!text) return;
  stdout.write(`${text}\n`);
}

export type UnwatchTty = () => void;

export interface WatchTtyResizeOptions {
  debounceMs?: number;
  /** Poll columns/rows; needed when `resize` is missing or unreliable (some Windows hosts). */
  pollMs?: number;
}

/**
 * Invoke `onResize` when terminal columns or rows change.
 * Combines Node's `resize` event with a lightweight poll.
 * 
 * Fixed to prevent duplicate resize handling:
 * - Task 3.1: Added resizePending flag to prevent multiple queued calls
 * - Task 3.2: Deduplicate Windows dual-trigger by tracking last processed size
 * - Task 3.3: Made onResize callback async-aware for serialization
 * - Task 3.4: Increased debounce timeout to 200ms
 */
export function watchTtyResize(
  onResize: () => void | Promise<void>,
  opts: WatchTtyResizeOptions = {},
): UnwatchTty {
  const stdout = process.stdout;
  const debounceMs = opts.debounceMs ?? 200; // Task 3.4: Increased from 150ms to 200ms
  // Polling + resize together can fire multiple full redraws on Windows.
  const pollMs =
    opts.pollMs ??
    (process.platform === 'win32' && !process.env.WT_SESSION ? 0 : 250);
  let cols = stdout.columns ?? 80;
  let rows = stdout.rows ?? 24;
  let timer: NodeJS.Timeout | undefined;
  let resizePending = false; // Task 3.1: Track whether a resize operation is in flight
  let lastProcessedCols = cols; // Task 3.2: Track last processed size for deduplication
  let lastProcessedRows = rows;

  const schedule = (): void => {
    const nextCols = stdout.columns ?? 80;
    const nextRows = stdout.rows ?? 24;
    
    // Task 3.2: Skip if size hasn't actually changed (deduplicates Windows dual-trigger)
    if (nextCols === cols && nextRows === rows) return;
    
    cols = nextCols;
    rows = nextRows;
    
    // Task 3.1: Skip if a resize is already pending
    if (resizePending) return;
    
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => { // Task 3.3: Made async to await callback
      timer = undefined;
      
      // Task 3.2: Check if this size was already processed (Windows dual-trigger)
      if (cols === lastProcessedCols && rows === lastProcessedRows) {
        return;
      }
      
      // Task 3.1: Set flag before calling onResize
      resizePending = true;
      
      try {
        // Task 3.3: Await the callback to ensure serialization
        await onResize();
        
        // Task 3.2: Update last processed size
        lastProcessedCols = cols;
        lastProcessedRows = rows;
      } finally {
        // Task 3.1: Always reset flag, even if onResize throws
        resizePending = false;
      }
    }, debounceMs);
  };

  stdout.on('resize', schedule);
  const poll = pollMs > 0 ? setInterval(schedule, pollMs) : undefined;

  return () => {
    stdout.off('resize', schedule);
    if (poll) clearInterval(poll);
    if (timer) clearTimeout(timer);
  };
}
