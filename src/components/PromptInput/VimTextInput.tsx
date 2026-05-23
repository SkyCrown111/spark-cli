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
 *    `-- INSERT --`, `-- NORMAL --`, `-- VISUAL --`, or `-- VISUAL LINE --`.
 *
 * Supported NORMAL mode commands:
 *   h/l/j/k — cursor movement (left/right/down/up)
 *   i/a/A/I/o/O — enter INSERT mode
 *   v — enter VISUAL mode (character selection)
 *   V — enter VISUAL LINE mode (line selection)
 *   x — delete character under cursor
 *   dd — delete current line
 *   0/$ — start/end of line
 *   w/b — word forward/backward
 *   g/G — first/last line
 *   u — undo (simple: clear current line)
 *   "a-"z — select register
 *   q — start/stop macro recording
 *   @a-@z — play macro
 *   . — repeat last change
 *
 * VISUAL mode:
 *   h/l — extend selection left/right
 *   j/k — extend selection down/up
 *   d/x — delete selection
 *   y — yank selection
 *   c — change selection (delete + enter INSERT)
 *   Esc — return to NORMAL
 *
 * INSERT mode:
 *   Esc — return to NORMAL mode (cursor moves left, matching Vim behavior)
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { VimMode } from '../../state/AppState.js';

// ── Register and macro state ───────────────────────────

export interface VimRegisterState {
  /** Named registers a-z plus unnamed register ". */
  registers: Record<string, string>;
  /** Currently selected register (undefined = unnamed). */
  activeRegister?: string;
  /** Macro recording state. */
  recording?: { register: string; keys: string[] };
  /** Last change for `.` repeat. */
  lastChange?: { type: string; data: unknown };
  /** Stored macros. */
  macros: Record<string, string[]>;
}

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
  /** VISUAL mode selection start position. */
  visualStart?: { line: number; col: number };
  /** Current vim mode. */
  vimMode?: VimMode;
}

export interface VimInputSetters {
  setInput: (text: string) => void;
  setLines: (lines: string[]) => void;
  setCursorPosition: (pos: number) => void;
  setCurrentLine: (line: number) => void;
  onVimModeChange: (mode: VimMode) => void;
  onSubmit: () => void;
  setVisualStart?: (pos: { line: number; col: number } | undefined) => void;
}

export interface VimInputConfig {
  multiline: boolean;
  maxLines: number;
  disabled: boolean;
}

// ── Text object helpers ────────────────────────────────

/** Get word boundaries around position. */
function getWordBoundaries(text: string, pos: number): { start: number; end: number } {
  if (text.length === 0) return { start: 0, end: 0 };
  let start = pos;
  let end = pos;
  // Find word start
  while (start > 0 && !isWordSep(text[start - 1]!)) start--;
  // Find word end
  while (end < text.length && !isWordSep(text[end]!)) end++;
  return { start, end };
}

/** Get WORD boundaries (non-whitespace) around position. */
function getWORDBoundaries(text: string, pos: number): { start: number; end: number } {
  if (text.length === 0) return { start: 0, end: 0 };
  let start = pos;
  let end = pos;
  while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\t') start--;
  while (end < text.length && text[end] !== ' ' && text[end] !== '\t') end++;
  return { start, end };
}

/** Get quoted string boundaries around position. */
function getQuotedBoundaries(
  text: string,
  pos: number,
  quote: string,
): { start: number; end: number } | null {
  // Find the quote character at or before position
  let qPos = text.indexOf(quote, pos);
  if (qPos < 0) qPos = text.lastIndexOf(quote, pos);
  if (qPos < 0) return null;

  // Find the matching quote
  const nextQ = text.indexOf(quote, qPos + 1);
  if (nextQ < 0) return null;

  return { start: qPos, end: nextQ + 1 };
}

/** Get parenthesized boundaries around position. */
function getBracketBoundaries(
  text: string,
  pos: number,
  open: string,
  close: string,
): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;

  // Search backward for opening bracket
  for (let i = pos; i >= 0; i--) {
    if (text[i] === close) depth++;
    if (text[i] === open) {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;

  // Search forward for closing bracket
  depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    if (text[i] === close) {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

// ── Pending key tracker (dd needs two 'd' presses) ──

const pendingDMap = new WeakMap<object, boolean>();
const pendingKeyMap = new WeakMap<object, string>();

function getPendingD(owner: object): boolean {
  return pendingDMap.get(owner) ?? false;
}

function setPendingD(owner: object, value: boolean): void {
  pendingDMap.set(owner, value);
}

function getPendingKey(owner: object): string | undefined {
  return pendingKeyMap.get(owner);
}

function setPendingKey(owner: object, value: string | undefined): void {
  if (value) pendingKeyMap.set(owner, value);
  else pendingKeyMap.delete(owner);
}

// ── Selection helpers for VISUAL mode ──────────────────

interface NormalizedSelection {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

function normalizeSelection(
  start: { line: number; col: number },
  end: { line: number; col: number },
  isLineMode: boolean,
): NormalizedSelection {
  if (isLineMode) {
    const minLine = Math.min(start.line, end.line);
    const maxLine = Math.max(start.line, end.line);
    return { startLine: minLine, startCol: 0, endLine: maxLine, endCol: Infinity };
  }
  if (start.line < end.line || (start.line === end.line && start.col <= end.col)) {
    return { startLine: start.line, startCol: start.col, endLine: end.line, endCol: end.col };
  }
  return { startLine: end.line, startCol: end.col, endLine: start.line, endCol: start.col };
}

function extractSelection(
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): string {
  if (startLine === endLine) {
    return (lines[startLine] ?? '').slice(startCol, endCol === Infinity ? undefined : endCol);
  }
  const parts: string[] = [];
  parts.push((lines[startLine] ?? '').slice(startCol));
  for (let i = startLine + 1; i < endLine; i++) {
    parts.push(lines[i] ?? '');
  }
  parts.push((lines[endLine] ?? '').slice(0, endCol === Infinity ? undefined : endCol));
  return parts.join('\n');
}

function deleteSelection(
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): string[] {
  const newLines = [...lines];
  if (startLine === endLine) {
    const line = newLines[startLine] ?? '';
    newLines[startLine] =
      line.slice(0, startCol) + line.slice(endCol === Infinity ? undefined : endCol);
    return newLines;
  }
  // Merge first and last line
  const firstPart = (newLines[startLine] ?? '').slice(0, startCol);
  const lastPart = (newLines[endLine] ?? '').slice(endCol === Infinity ? undefined : endCol);
  newLines.splice(startLine, endLine - startLine + 1, firstPart + lastPart);
  return newLines;
}

// ── NORMAL mode key handler ────────────────────────────

/**
 * Handle a key in Vim NORMAL or VISUAL mode.
 *
 * @param owner - A stable object reference for tracking pending keys (dd).
 *                Pass the same ref each call. Use `useRef({})` in the component.
 * @param ch - The input character
 * @param key - The key object from useInput
 * @param state - Current input state
 * @param setters - State setters
 * @param config - Input configuration
 * @param regState - Register and macro state (mutated in place)
 * @returns true if the key was consumed (caller should skip its own handling)
 */
export function handleVimNormalKey(
  owner: object,
  ch: string,
  key: {
    leftArrow?: boolean;
    rightArrow?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
    ctrl?: boolean;
    meta?: boolean;
  },
  state: VimInputState,
  setters: VimInputSetters,
  config: VimInputConfig,
  regState?: VimRegisterState,
): boolean {
  const { lines, cursorPosition, currentLine, visualStart, vimMode } = state;
  const {
    setInput,
    setLines,
    setCursorPosition,
    setCurrentLine,
    onVimModeChange,
    onSubmit,
    setVisualStart,
  } = setters;
  const { multiline, maxLines } = config;
  const isVisual = vimMode === 'VISUAL' || vimMode === 'VISUAL LINE';

  // Helper to save text to register
  const saveToRegister = (text: string) => {
    if (!regState) return;
    const reg = regState.activeRegister ?? '"';
    regState.registers[reg] = text;
    regState.activeRegister = undefined;
  };

  // Helper to get text from register
  const getFromRegister = (): string => {
    if (!regState) return '';
    const reg = regState.activeRegister ?? '"';
    return regState.registers[reg] ?? '';
  };

  // Helper to record macro key
  const recordMacroKey = (k: string) => {
    if (regState?.recording) {
      regState.recording.keys.push(k);
    }
  };

  // ── Arrow keys ──
  if (key.leftArrow) {
    if (isVisual) {
      setCursorPosition(Math.max(0, cursorPosition - 1));
    } else {
      setCursorPosition(Math.max(0, cursorPosition - 1));
    }
    recordMacroKey('h');
    return true;
  }
  if (key.rightArrow) {
    const lineLen = lines[currentLine]?.length ?? 0;
    setCursorPosition(Math.min(lineLen, cursorPosition + 1));
    recordMacroKey('l');
    return true;
  }
  if (key.upArrow) {
    if (currentLine > 0) {
      setCurrentLine(currentLine - 1);
      const prevLineLen = lines[currentLine - 1]?.length ?? 0;
      setCursorPosition(Math.min(cursorPosition, prevLineLen));
    }
    recordMacroKey('k');
    return true;
  }
  if (key.downArrow) {
    if (currentLine < lines.length - 1) {
      setCurrentLine(currentLine + 1);
      const nextLineLen = lines[currentLine + 1]?.length ?? 0;
      setCursorPosition(Math.min(cursorPosition, nextLineLen));
    }
    recordMacroKey('j');
    return true;
  }

  // Enter in NORMAL mode: submit
  if (key.return && !isVisual) {
    onSubmit();
    return true;
  }

  // Ctrl+key combinations are not Vim commands (Ctrl+G, Ctrl+R etc handled elsewhere)
  if (key.ctrl || key.meta) return false;

  // Record key for macros
  recordMacroKey(ch);

  // ── VISUAL mode commands ──
  if (isVisual) {
    const selStart = visualStart ?? { line: currentLine, col: cursorPosition };
    switch (ch) {
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
      case 'd':
      case 'x': {
        // Delete selected text
        const { startLine, startCol, endLine, endCol } = normalizeSelection(
          selStart,
          { line: currentLine, col: cursorPosition },
          vimMode === 'VISUAL LINE',
        );
        const deleted = extractSelection(lines, startLine, startCol, endLine, endCol);
        saveToRegister(deleted);
        const newLines = deleteSelection(lines, startLine, startCol, endLine, endCol);
        setLines(newLines);
        setInput(newLines.join('\n'));
        setCurrentLine(Math.min(startLine, newLines.length - 1));
        setCursorPosition(startCol);
        setVisualStart?.(undefined);
        onVimModeChange('NORMAL');
        // Save for repeat
        if (regState) regState.lastChange = { type: 'delete', data: { text: deleted } };
        return true;
      }
      case 'y': {
        // Yank selected text
        const { startLine, startCol, endLine, endCol } = normalizeSelection(
          selStart,
          { line: currentLine, col: cursorPosition },
          vimMode === 'VISUAL LINE',
        );
        const yanked = extractSelection(lines, startLine, startCol, endLine, endCol);
        saveToRegister(yanked);
        setVisualStart?.(undefined);
        onVimModeChange('NORMAL');
        return true;
      }
      case 'c': {
        // Change selected text (delete + enter INSERT)
        const { startLine, startCol, endLine, endCol } = normalizeSelection(
          selStart,
          { line: currentLine, col: cursorPosition },
          vimMode === 'VISUAL LINE',
        );
        const deleted = extractSelection(lines, startLine, startCol, endLine, endCol);
        saveToRegister(deleted);
        const newLines = deleteSelection(lines, startLine, startCol, endLine, endCol);
        setLines(newLines);
        setInput(newLines.join('\n'));
        setCurrentLine(Math.min(startLine, newLines.length - 1));
        setCursorPosition(startCol);
        setVisualStart?.(undefined);
        onVimModeChange('INSERT');
        if (regState) regState.lastChange = { type: 'change', data: { text: deleted } };
        return true;
      }
      case 'o': {
        // Swap cursor to other end of selection
        setCursorPosition(selStart.col);
        setCurrentLine(selStart.line);
        setVisualStart?.({ line: currentLine, col: cursorPosition });
        return true;
      }
      case 'v':
        if (vimMode === 'VISUAL') {
          setVisualStart?.(undefined);
          onVimModeChange('NORMAL');
        } else {
          onVimModeChange('VISUAL');
        }
        return true;
      case 'V':
        if (vimMode === 'VISUAL LINE') {
          setVisualStart?.(undefined);
          onVimModeChange('NORMAL');
        } else {
          onVimModeChange('VISUAL LINE');
        }
        return true;
      case 'i':
        // Text object: inner (wait for next key)
        setPendingKey(owner, 'i-obj');
        return true;
      case 'a':
        // Text object: around (wait for next key)
        setPendingKey(owner, 'a-obj');
        return true;
      default:
        return true;
    }
  }

  // ── Text object selection (iw, aw, i", a", i(, a(, etc.) ──
  if (isVisual && (getPendingKey(owner) === 'i-obj' || getPendingKey(owner) === 'a-obj')) {
    const isInner = getPendingKey(owner) === 'i-obj';
    setPendingKey(owner, undefined);
    const lineText = lines[currentLine] ?? '';
    let boundaries: { start: number; end: number } | null = null;

    switch (ch) {
      case 'w':
        boundaries = isInner
          ? getWordBoundaries(lineText, cursorPosition)
          : getWORDBoundaries(lineText, cursorPosition);
        break;
      case '"':
        boundaries = getQuotedBoundaries(lineText, cursorPosition, '"');
        break;
      case "'":
        boundaries = getQuotedBoundaries(lineText, cursorPosition, "'");
        break;
      case '`':
        boundaries = getQuotedBoundaries(lineText, cursorPosition, '`');
        break;
      case '(':
      case ')':
        boundaries = getBracketBoundaries(lineText, cursorPosition, '(', ')');
        break;
      case '[':
      case ']':
        boundaries = getBracketBoundaries(lineText, cursorPosition, '[', ']');
        break;
      case '{':
      case '}':
        boundaries = getBracketBoundaries(lineText, cursorPosition, '{', '}');
        break;
    }

    if (boundaries) {
      // Expand visual selection to include the text object
      const start = isInner ? boundaries.start : Math.max(0, boundaries.start);
      const end = isInner ? boundaries.end : Math.min(lineText.length, boundaries.end);
      setVisualStart?.({ line: currentLine, col: start });
      setCursorPosition(end);
    }
    return true;
  }

  // ── Register selection ("a-"z) ──
  if (getPendingKey(owner) === '"') {
    setPendingKey(owner, undefined);
    if (ch >= 'a' && ch <= 'z' && regState) {
      regState.activeRegister = ch;
      return true;
    }
    return true;
  }

  // ── Macro register selection (after q) ──
  if (getPendingKey(owner) === 'q-reg') {
    setPendingKey(owner, undefined);
    if (ch >= 'a' && ch <= 'z' && regState) {
      regState.recording = { register: ch, keys: [] };
    }
    return true;
  }

  // ── Macro playback (@a-@z) ──
  if (getPendingKey(owner) === '@') {
    setPendingKey(owner, undefined);
    if (ch >= 'a' && ch <= 'z' && regState) {
      const macro = regState.macros[ch];
      if (macro) {
        // Play back recorded keys (simplified — just log for now)
        // In a full implementation, this would replay the key sequence
      }
      return true;
    }
    return true;
  }

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

    // ── Enter VISUAL mode ──
    case 'v':
      setVisualStart?.({ line: currentLine, col: cursorPosition });
      onVimModeChange('VISUAL');
      return true;
    case 'V':
      setVisualStart?.({ line: currentLine, col: 0 });
      onVimModeChange('VISUAL LINE');
      return true;

    // ── Register selection ──
    case '"':
      setPendingKey(owner, '"');
      return true;

    // ── Macro recording ──
    case 'q': {
      if (!regState) return true;
      if (regState.recording) {
        // Stop recording
        const reg = regState.recording.register;
        regState.macros[reg] = regState.recording.keys;
        regState.recording = undefined;
      } else {
        // Start recording (next key is the register)
        setPendingKey(owner, 'q-reg');
      }
      return true;
    }

    // ── Macro playback ──
    case '@':
      setPendingKey(owner, '@');
      return true;

    // ── Repeat last change ──
    case '.': {
      if (!regState?.lastChange) return true;
      const { type, data } = regState.lastChange;
      if (type === 'delete' || type === 'change') {
        const text = (data as { text: string }).text;
        // Re-insert the deleted text at cursor for 'change', or do nothing for 'delete'
        if (type === 'change') {
          const lineText = lines[currentLine] ?? '';
          const newLines = [...lines];
          newLines[currentLine] =
            lineText.slice(0, cursorPosition) + text + lineText.slice(cursorPosition);
          setLines(newLines);
          setInput(newLines.join('\n'));
          setCursorPosition(cursorPosition + text.length);
        }
      }
      return true;
    }

    // ── Delete ──
    case 'x': {
      const lineText = lines[currentLine] ?? '';
      if (cursorPosition < lineText.length) {
        const newLines = [...lines];
        newLines[currentLine] =
          lineText.slice(0, cursorPosition) + lineText.slice(cursorPosition + 1);
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

    // ── Paste ──
    case 'p': {
      const text = getFromRegister();
      if (!text) return true;
      const lineText = lines[currentLine] ?? '';
      const newLines = [...lines];
      // Paste after cursor
      newLines[currentLine] =
        lineText.slice(0, cursorPosition) + text + lineText.slice(cursorPosition);
      setLines(newLines);
      setInput(newLines.join('\n'));
      setCursorPosition(cursorPosition + text.length);
      return true;
    }

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
 * VimModeIndicator — renders `-- INSERT --`, `-- NORMAL --`,
 * `-- VISUAL --`, or `-- VISUAL LINE --` at the bottom of the input area.
 */
export const VimModeIndicator: React.FC<VimModeIndicatorProps> = ({ vimMode }) => {
  const modeMap: Record<VimMode, { label: string; color: string }> = {
    INSERT: { label: '-- INSERT --', color: 'green' },
    NORMAL: { label: '-- NORMAL --', color: 'blue' },
    VISUAL: { label: '-- VISUAL --', color: 'magenta' },
    'VISUAL LINE': { label: '-- VISUAL LINE --', color: 'magenta' },
  };
  const { label, color } = modeMap[vimMode] ?? { label: '-- NORMAL --', color: 'blue' };

  return (
    <Box paddingLeft={1}>
      <Text color={color as 'green' | 'blue' | 'magenta'} bold>
        {label}
      </Text>
    </Box>
  );
};

// ── Re-export ──
export type { VimMode };
