/**
 * Terminal querier — detect terminal capabilities.
 *
 * Determines whether the current terminal supports advanced features
 * like VT mode, Kitty keyboard protocol, mouse tracking, and
 * ANSI hyperlinks. This information is used to adapt keybindings
 * and rendering behavior for different terminal environments.
 */

export interface TerminalCapabilities {
  /** Platform (windows, macos, linux) */
  platform: 'windows' | 'macos' | 'linux' | 'unknown';
  /** Whether VT mode is supported (Windows Terminal) */
  supportsVTMode: boolean;
  /** Whether Kitty keyboard protocol is supported */
  supportsKittyProtocol: boolean;
  /** Whether mouse tracking is supported */
  supportsMouseTracking: boolean;
  /** Whether ANSI hyperlinks are supported */
  supportsAnsiHyperlinks: boolean;
  /** Whether the terminal has cursor up viewport yank bug (Windows conpty) */
  hasCursorUpViewportYankBug: boolean;
}

/**
 * Detect the current platform.
 */
export function getPlatform(): 'windows' | 'macos' | 'linux' | 'unknown' {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

/**
 * Detect terminal capabilities based on environment.
 */
export function detectTerminalCapabilities(): TerminalCapabilities {
  const platform = getPlatform();

  // VT mode detection: Windows 10+ with Windows Terminal usually supports it
  const isWindows = platform === 'windows';

  // Kitty protocol: check TERM environment
  const termProgram = process.env.TERM_PROGRAM ?? '';
  const term = process.env.TERM ?? '';
  const supportsKittyProtocol =
    termProgram === 'kitty' ||
    termProgram === 'WezTerm' ||
    termProgram === 'ghostty' ||
    term === 'xterm-kitty';

  // Mouse tracking: most modern terminals support it
  const supportsMouseTracking =
    !isWindows || supportsKittyProtocol;

  // ANSI hyperlinks: supported by most terminals except very old ones
  const supportsAnsiHyperlinks =
    termProgram !== 'Apple_Terminal'; // macOS Terminal.app doesn't support them

  // Windows VT mode: Node 24.2+ and Bun 1.2.23+ enable VT processing
  const supportsVTMode = !isWindows; // Assume VT on non-Windows; Windows needs runtime check

  // Windows conpty cursor-up viewport-yank bug
  const hasCursorUpViewportYankBug = isWindows && !supportsVTMode;

  return {
    platform,
    supportsVTMode,
    supportsKittyProtocol,
    supportsMouseTracking,
    supportsAnsiHyperlinks,
    hasCursorUpViewportYankBug,
  };
}

/**
 * Cached terminal capabilities (computed once, then reused).
 */
let cachedCapabilities: TerminalCapabilities | null = null;

/**
 * Get terminal capabilities (cached).
 */
export function getTerminalCapabilities(): TerminalCapabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = detectTerminalCapabilities();
  }
  return cachedCapabilities;
}

/**
 * Force re-detection of terminal capabilities (e.g., after env change).
 */
export function resetTerminalCapabilities(): void {
  cachedCapabilities = null;
}