/**
 * VimTextInput — Vim-style input mode support for PromptInput.
 *
 * This module provides two exports:
 *
 * 1. `handleVimNormalKey()` — a pure function that handles NORMAL mode
 *    Vim keybindings. Called from PromptInput's useInput handler when
 *    vimEnabled && vimMode === 'NORMAL'. Returns true if the key was
 *    consumed (PromptInput should skip its own handling).
 *
 * 2. `VimModeIndicator` — a render-only component that shows
 *    `-- INSERT --` or `-- NORMAL --` in the input area.
 *
 * Supported NORMAL mode commands:
 *   h/l/j/k — cursor movement (left/right/down/up)
 *   i/a/A/I/o/O — enter INSERT mode
 *   x — delete character under cursor
 *   dd — delete current line
 *   0/$ — start/end of line
 *   w/b — word forward/backward
 *   g/G — first/last line
 *   u — undo (simple: clear current line)
 *
 * INSERT mode:
 *   Esc — return to NORMAL mode (cursor moves left, matching Vim behavior)
 *
 * Ported from cc-haha's VimTextInput, simplified for basic
 * NORMAL/INSERT support (no visual mode, no ex commands, no registers).
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { VimMode } from '../../state/AppState.js';

// ── Word motion helpers ────────────────────────────────

function isWordSep(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

/** Find the start of the next word from position `pos` in `text`. */
function nextWordPos(text: string, pos: number): number {
  const len = text.length;
  if (pos >= len - 1) return len;
  let i = pos;
  while (i < len && !isWordSep(text[i])) i++;
  while (i < len && isWordSep(text[i])) i++;
  return i;
}

/** Find the start of the previous word from position `pos` in `text`. */
function prevWordPos(text: string, pos: number): number {
  if (pos <= 0) return 0;
  let i = pos - 1;
  while (i > 0 && isWordSep(text[i])) i--;
  while (i > 0 && !isWordSep(text[i - 1])) i--;
  return i;
}

// ── State interface (matches PromptInput's internal state) ──

export interface VimInputState {
  input: string;
  lines: string[];
  cursorPosition: number;
  currentLine: number;
}

export interface VimInputSetters {
  setInput: (text: string) => void;
  setLines: (lines: string[]) => void;
  setCursorPosition: (pos: number) => void;
  setCurrentLine: (line: number) => void;
  onVimModeChange: (mode: VimMode) => void;
  onSubmit: () => void;
}

export interface VimInputConfig {
  multiline: boolean;
  maxLines: number;
  disabled: boolean;
}

// ── Pending key tracker (dd needs two 'd' presses) ──

const pendingDMap = new WeakMap<object, boolean>();

function getPendingD(owner: object): boolean {
  return pendingDMap.get(owner) ?? false;
}

function setPendingD(owner: object, value: boolean): void {
  pendingDMap.set(owner, value);
}

// ── NORMAL mode key handler ────────────────────────────

/**
 * Handle a key in Vim NORMAL mode.
 *
 * @param owner - A stable object reference for tracking pending keys (dd).
 *                Pass the same ref each call. Use `useRef({})` in the component.
 * @param ch - The input character
 * @param key - The key object from useInput
 * @param state - Current input state
 * @param setters - State setters
 * @param config - Input configuration
 * @returns true if the key was consumed (caller should skip its own handling)
 */
export function handleVimNormalKey(
  owner: object,
  ch: string,
  key: { leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean; return?: boolean; ctrl?: boolean; meta?: boolean },
  state: VimInputState,
  setters: VimInputSetters,
  config: VimInputConfig,
): boolean {
  const { lines, cursorPosition, currentLine } = state;
  const { setInput, setLines, setCursorPosition, setCurrentLine, onVimModeChange, onSubmit } = setters;
  const { multiline, maxLines } = config;

  // ── Arrow keys ──
  if (key.leftArrow) {
    setCursorPosition(Math.max(0, cursorPosition - 1));
    return true;
  }
  if (key.rightArrow) {
    const lineLen = lines[currentLine]?.length ?? 0;
    setCursorPosition(Math.min(lineLen, cursorPosition + 1));
    return true;
  }
  if (key.upArrow) {
    if (currentLine > 0) {
      setCurrentLine(currentLine - 1);
      const prevLineLen = lines[currentLine - 1]?.length ?? 0;
      setCursorPosition(Math.min(cursorPosition, prevLineLen));
    }
    return true;
  }
  if (key.downArrow) {
    if (currentLine < lines.length - 1) {
      setCurrentLine(currentLine + 1);
      const nextLineLen = lines[currentLine + 1]?.length ?? 0;
      setCursorPosition(Math.min(cursorPosition, nextLineLen));
    }
    return true;
  }

  // Enter in NORMAL mode: submit
  if (key.return) {
    onSubmit();
    return true;
  }

  // Ctrl+key combinations are not Vim commands (Ctrl+G, Ctrl+R etc handled elsewhere)
  if (key.ctrl || key.meta) return false;

  // ── Character commands ──
  switch (ch) {
    // ── Movement ──
    case 'h':
      setCursorPosition(Math.max(0, cursorPosition - 1));
      return true;
    case 'l': {
      const lineLen = lines[currentLine]?.length ?? 0;
      setCursorPosition(Math.min(lineLen, cursorPosition + 1));
      return true;
    }
    case 'j':
      if (currentLine < lines.length - 1) {
        setCurrentLine(currentLine + 1);
        const nextLineLen = lines[currentLine + 1]?.length ?? 0;
        setCursorPosition(Math.min(cursorPosition, nextLineLen));
      }
      return true;
    case 'k':
      if (currentLine > 0) {
        setCurrentLine(currentLine - 1);
        const prevLineLen = lines[currentLine - 1]?.length ?? 0;
        setCursorPosition(Math.min(cursorPosition, prevLineLen));
      }
      return true;
    case '0':
      setCursorPosition(0);
      return true;
    case '$': {
      const lineLen = lines[currentLine]?.length ?? 0;
      setCursorPosition(lineLen);
      return true;
    }
    case 'w': {
      const lineText = lines[currentLine] ?? '';
      setCursorPosition(nextWordPos(lineText, cursorPosition));
      return true;
    }
    case 'b': {
      const lineText = lines[currentLine] ?? '';
      setCursorPosition(prevWordPos(lineText, cursorPosition));
      return true;
    }

    // ── Enter INSERT mode ──
    case 'i':
      onVimModeChange('INSERT');
      return true;
    case 'a': {
      const lineLen = lines[currentLine]?.length ?? 0;
      setCursorPosition(Math.min(lineLen, cursorPosition + 1));
      onVimModeChange('INSERT');
      return true;
    }
    case 'A': {
      const lineLen = lines[currentLine]?.length ?? 0;
      setCursorPosition(lineLen);
      onVimModeChange('INSERT');
      return true;
    }
    case 'I':
      setCursorPosition(0);
      onVimModeChange('INSERT');
      return true;
    case 'o': {
      if (multiline && lines.length < maxLines) {
        const newLines = [...lines];
        newLines.splice(currentLine + 1, 0, '');
        setLines(newLines);
        setCurrentLine(currentLine + 1);
        setCursorPosition(0);
        setInput(newLines.join('\n'));
      }
      onVimModeChange('INSERT');
      return true;
    }
    case 'O': {
      if (multiline && lines.length < maxLines) {
        const newLines = [...lines];
        newLines.splice(currentLine, 0, '');
        setLines(newLines);
        setCursorPosition(0);
        setInput(newLines.join('\n'));
      }
      onVimModeChange('INSERT');
      return true;
    }

    // ── Delete ──
    case 'x': {
      const lineText = lines[currentLine] ?? '';
      if (cursorPosition < lineText.length) {
        const newLines = [...lines];
        newLines[currentLine] = lineText.slice(0, cursorPosition) + lineText.slice(cursorPosition + 1);
        setLines(newLines);
        setInput(newLines.join('\n'));
        if (cursorPosition >= newLines[currentLine].length) {
          setCursorPosition(Math.max(0, newLines[currentLine].length - 1));
        }
      }
      return true;
    }
    case 'd': {
      if (getPendingD(owner)) {
        // dd: delete current line
        setPendingD(owner, false);
        if (lines.length > 1) {
          const newLines = [...lines];
          newLines.splice(currentLine, 1);
          const newCurrentLine = Math.min(currentLine, newLines.length - 1);
          setLines(newLines);
          setCurrentLine(newCurrentLine);
          setCursorPosition(0);
          setInput(newLines.join('\n'));
        } else {
          setLines(['']);
          setCurrentLine(0);
          setCursorPosition(0);
          setInput('');
        }
      } else {
        setPendingD(owner, true);
        setTimeout(() => setPendingD(owner, false), 500);
      }
      return true;
    }

    // ── Paste (placeholder) ──
    case 'p':
      return true;

    // ── Line navigation ──
    case 'g':
      setCurrentLine(0);
      setCursorPosition(0);
      return true;
    case 'G':
      setCurrentLine(lines.length - 1);
      setCursorPosition(0);
      return true;

    // ── Undo (simple) ──
    case 'u': {
      const newLines = [...lines];
      newLines[currentLine] = '';
      setLines(newLines);
      setCursorPosition(0);
      setInput(newLines.join('\n'));
      return true;
    }

    default:
      // Unknown NORMAL mode key — consume to prevent passthrough
      return true;
  }
}

// ── Mode indicator component ────────────────────────────

export interface VimModeIndicatorProps {
  vimMode: VimMode;
}

/**
 * VimModeIndicator — renders `-- INSERT --` or `-- NORMAL --`
 * at the bottom of the input area when Vim mode is enabled.
 */
export const VimModeIndicator: React.FC<VimModeIndicatorProps> = ({ vimMode }) => {
  const modeLabel = vimMode === 'INSERT' ? '-- INSERT --' : '-- NORMAL --';
  const modeColor = vimMode === 'INSERT' ? 'green' : 'blue';

  return (
    <Box paddingLeft={1}>
      <Text color={modeColor} bold>{modeLabel}</Text>
    </Box>
  );
};

// ── Re-export ──
export type { VimMode };