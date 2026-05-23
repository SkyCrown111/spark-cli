/**
 * Synchronized Output Patch — monkey-patches `process.stdout.write`
 * to wrap every Ink render output in BSU/ESU (DEC 2026) sequences.
 *
 * This is the "no-fork" approach to flicker-free rendering. Instead of
 * forking Ink's entire rendering pipeline, we intercept stdout.write
 * and inject synchronized update markers around each write call.
 *
 * When the terminal supports DEC 2026 (most modern terminals do):
 * - BSU (\x1b[?2026h) tells the terminal to buffer incoming output
 * - ESU (\x1b[?2026l) tells the terminal to flush the buffer atomically
 *
 * The result: the terminal only paints the complete frame, eliminating
 * the partial-render flicker that makes CLI apps look janky.
 *
 * Inspired by Claude Code's render-to-screen.ts approach, but without
 * requiring a full Ink renderer fork.
 *
 * Usage:
 * ```ts
 * import { installSynchronizedOutput, uninstallSynchronizedOutput } from './synchronizedOutput.js';
 *
 * // Install before Ink render
 * installSynchronizedOutput();
 *
 * // Uninstall on cleanup
 * uninstallSynchronizedOutput();
 * ```
 */

import { BSU, ESU } from '../termio/dec.js';

// ── State ──────────────────────────────────────────────

/** The original stdout.write method, saved for restore */
let originalWrite: typeof process.stdout.write | null = null;

/** Whether the patch is currently installed */
let installed = false;

/** Whether the terminal likely supports DEC 2026 */
function supportsSynchronizedOutput(): boolean {
  // Dumb terminals and non-TTYs don't support it
  if (process.env.TERM === 'dumb') return false;
  if (!process.stdout.isTTY) return false;

  // Windows Terminal, iTerm2, kitty, Alacritty, WezTerm, etc. all support DEC 2026
  // xterm.js also supports it. Most terminals from 2020+ do.
  // Only installed for fullscreen Ink REPL (alternate-screen renderer).
  return true;
}

// ── Heuristic: detect Ink render writes ────────────────

/**
 * Determine whether a write is likely an Ink render frame.
 *
 * Ink renders by writing the entire frame as a single write call
 * (after computing the diff). We want to wrap these writes in BSU/ESU.
 *
 * For small writes (cursor moves, single-char reads), wrapping is
 * unnecessary overhead. We only wrap writes above a size threshold.
 */
const MIN_WRAP_LENGTH = 20; // Ink frames are typically >20 chars

// ── Patch ──────────────────────────────────────────────

/**
 * Install the synchronized output patch on process.stdout.
 *
 * After installation, every sufficiently-large write to stdout
 * will be wrapped in BSU/ESU sequences, causing the terminal
 * to render the output atomically.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function installSynchronizedOutput(): void {
  if (installed) return;
  if (!supportsSynchronizedOutput()) return;

  const origWrite = process.stdout.write.bind(process.stdout);
  originalWrite = origWrite as typeof process.stdout.write;

  // Replace stdout.write with our patched version
  // We use `any` for the overload signatures because the Node.js
  // type definitions have multiple overloads that are hard to satisfy
  // with a single implementation.
  process.stdout.write = function (buffer: string | Uint8Array, arg2?: any, arg3?: any): boolean {
    // Normalize to string for length check
    const str =
      typeof buffer === 'string'
        ? buffer
        : Buffer.isBuffer(buffer)
          ? buffer.toString(typeof arg2 === 'string' ? (arg2 as BufferEncoding) : 'utf8')
          : new TextDecoder(typeof arg2 === 'string' ? arg2 : 'utf8').decode(buffer);

    // Only wrap sufficiently large writes (Ink render frames)
    if (str.length >= MIN_WRAP_LENGTH) {
      // Write: BSU + content + ESU
      const wrapped = BSU + str + ESU;

      if (typeof arg3 === 'function') {
        return origWrite(wrapped, arg3 as () => void);
      }
      if (typeof arg2 === 'function') {
        return origWrite(wrapped, arg2 as () => void);
      }
      return origWrite(wrapped);
    }

    // Small writes pass through unmodified
    if (typeof arg3 === 'function') {
      return origWrite(buffer as string, arg2 as BufferEncoding, arg3 as () => void);
    }
    if (typeof arg2 === 'function') {
      return origWrite(buffer as string, arg2 as () => void);
    }
    if (typeof arg2 === 'string') {
      return origWrite(buffer as string, arg2 as BufferEncoding);
    }
    return origWrite(buffer as string);
  } as typeof process.stdout.write;

  installed = true;
}

/**
 * Uninstall the synchronized output patch, restoring the
 * original stdout.write method.
 *
 * Call this on cleanup/unmount to avoid leaking the patch.
 */
export function uninstallSynchronizedOutput(): void {
  if (!installed || !originalWrite) return;

  process.stdout.write = originalWrite;
  originalWrite = null;
  installed = false;
}

/**
 * Check whether the synchronized output patch is currently installed.
 */
export function isSynchronizedOutputInstalled(): boolean {
  return installed;
}
