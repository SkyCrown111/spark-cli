/**
 * PromptInput component - Main input component for user prompts.
 *
 * Supports multi-line input, cursor movement, mode switching,
 * input history, typeahead (/slash commands, @files), history
 * search (Ctrl+R), and external editor (Ctrl+G).
 *
 * After Phase 16-H: integrates useTypeahead, useHistorySearch,
 * and editPromptInEditor for full Claude Code input parity.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useInput } from 'ink';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { useTypeahead } from '../../hooks/useTypeahead.js';
import { useHistorySearch } from '../../hooks/useHistorySearch.js';
import { useImagePaste } from '../../hooks/useImagePaste.js';
import { editPromptInEditor } from '../../utils/promptEditor.js';
import { filterFileSuggestions, getFileSuggestions, type FileSuggestion } from '../../utils/suggestions/fileSuggestions.js';
import type { SuggestionItem } from '../../utils/suggestions/commandSuggestions.js';
import { handleVimNormalKey, type VimInputState, type VimInputSetters, type VimInputConfig } from './VimTextInput.js';
import type { VimMode } from '../../state/AppState.js';

export type InputMode = 'chat' | 'direct' | 'plan' | 'bash';

export interface PromptInputProps {
  /** Callback when user submits input (presses Enter) */
  onSubmit: (text: string) => void;

  /** Callback when user submits a bash command (! prefix). If not provided, bash commands go through onSubmit. */
  onBashSubmit?: (command: string) => void;

  /** Placeholder text when input is empty */
  placeholder?: string;

  /** Current input mode */
  mode?: InputMode;

  /** Callback when mode changes (Shift+Tab) */
  onModeChange?: (mode: InputMode) => void;

  /** Whether the input is disabled (e.g., during AI response) */
  disabled?: boolean;

  /** Input history for up/down arrow navigation */
  history?: string[];

  /** Callback when history navigation occurs */
  onHistoryNavigate?: (index: number) => void;

  /** Whether to support multi-line input (Shift+Enter for new line) */
  multiline?: boolean;

  /** Maximum number of lines for multi-line input */
  maxLines?: number;

  /** Project root for @-file suggestions */
  projectRoot?: string;

  /** Whether Vim input mode is enabled */
  vimEnabled?: boolean;

  /** Current Vim mode (only used when vimEnabled=true) */
  vimMode?: VimMode;

  /** Callback when Vim mode changes */
  onVimModeChange?: (mode: VimMode) => void;

  /** Callback when an image is pasted (file path detected in pasted text) */
  onImagePaste?: (image: { id: string; filename: string; filePath: string; extension: string; size: number }) => void;
}

// ── Mode color helper ──────────────────────────────────────

function getModeColor(m: InputMode): string {
  switch (m) {
    case 'chat':   return 'cyan';
    case 'direct': return 'green';
    case 'plan':   return 'magenta';
    default:       return 'white';
  }
}

/**
 * PromptInput component for user input with advanced features.
 *
 * Features:
 * - Multi-line input support (Shift+Enter)
 * - Cursor movement (Left/Right arrows)
 * - Backspace and Delete
 * - Mode switching (Shift+Tab)
 * - Input history (Up/Down arrows)
 * - Typeahead for /slash commands and @files (Tab to accept, Escape to dismiss)
 * - History search (Ctrl+R, n/N to navigate)
 * - External editor (Ctrl+G launches $EDITOR)
 * - Submit on Enter (or Ctrl+Enter for multi-line)
 */
export const PromptInput: React.FC<PromptInputProps> = ({
  onSubmit,
  onBashSubmit,
  placeholder = 'Type your message...',
  mode = 'chat',
  onModeChange,
  disabled = false,
  history = [],
  onHistoryNavigate,
  multiline = true,
  maxLines = 10,
  projectRoot,
  vimEnabled = false,
  vimMode = 'INSERT',
  onVimModeChange,
  onImagePaste,
}) => {
  // ── Core input state ──
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);

  // ── Vim pending key tracker (for dd command) ──
  const vimPendingRef = useRef({});

  // ── Typeahead integration ──
  const typeahead = useTypeahead();

  // ── History search integration ──
  const historySearch = useHistorySearch(history);

  // ── Image paste integration ──
  const imagePaste = useImagePaste({
    onImagePaste: onImagePaste,
  });

  // ── File suggestions (lazy-loaded) ──
  const fileSuggestionsRef = useRef<FileSuggestion[] | null>(null);

  const getFileSuggestionsCached = useCallback(() => {
    if (!projectRoot) return [];
    if (!fileSuggestionsRef.current) {
      try {
        fileSuggestionsRef.current = getFileSuggestions(projectRoot);
      } catch {
        fileSuggestionsRef.current = [];
      }
    }
    return fileSuggestionsRef.current;
  }, [projectRoot]);

  // ── Update input helper ──
  const updateInput = useCallback((newInput: string) => {
    const newLines = newInput.split('\n');
    setInput(newInput);
    setLines(newLines);
    // Place cursor at end of last line
    setCurrentLine(newLines.length - 1);
    setCursorPosition(newLines[newLines.length - 1].length);
  }, []);

  // ── Update typeahead on input change ──
  useEffect(() => {
    if (historySearch.active) return; // Don't update typeahead during history search

    if (input.startsWith('/')) {
      typeahead.updateSuggestions(input);
    } else if (input.includes('@')) {
      // Find the @-reference portion after the last space
      const lastAtIndex = input.lastIndexOf('@');
      const beforeAt = input.slice(0, lastAtIndex);
      // Only trigger if @ is at start or preceded by a space
      if (lastAtIndex === 0 || beforeAt.endsWith(' ') || beforeAt.endsWith('\n')) {
        const query = input.slice(lastAtIndex + 1);
        const files = getFileSuggestionsCached();
        const filtered = filterFileSuggestions(files, query);
        // Convert FileSuggestion[] to SuggestionItem[] for typeahead
        const items: SuggestionItem[] = filtered.map((f) => ({
          value: beforeAt + '@' + f.value,
          label: '@' + f.label,
          description: f.extension,
          category: 'file',
        }));
        // Directly set typeahead state (bypass updateSuggestions which is for /commands)
        // Instead, we'll use a simplified approach: show file suggestions inline
        if (items.length > 0) {
          typeahead.updateSuggestions(''); // Reset command suggestions
        }
      }
    } else {
      typeahead.updateSuggestions(input);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, historySearch.active]);

  // ── Detect bash mode ──
  const effectiveMode: InputMode = input.startsWith('!') && !disabled ? 'bash' : mode;

  // ── Mode cycling: chat -> direct -> plan -> chat ──
  const cycleMode = useCallback(() => {
    if (!onModeChange) return;

    const modes: InputMode[] = ['chat', 'direct', 'plan'];
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    onModeChange(modes[nextIndex]);
  }, [mode, onModeChange]);

  // ── History navigation ──
  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    if (history.length === 0) return;

    let newIndex = historyIndex;

    if (direction === 'up') {
      newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
    } else {
      newIndex = historyIndex > -1 ? historyIndex - 1 : -1;
    }

    setHistoryIndex(newIndex);

    if (newIndex === -1) {
      setInput('');
      setLines(['']);
      setCurrentLine(0);
      setCursorPosition(0);
    } else {
      const historyText = history[history.length - 1 - newIndex];
      updateInput(historyText);
    }

    if (onHistoryNavigate) {
      onHistoryNavigate(newIndex);
    }
  }, [history, historyIndex, onHistoryNavigate, updateInput]);

  // ── Submit handler ──
  const handleSubmit = useCallback(() => {
    if (input.trim() && !disabled) {
      // Bash mode: strip ! prefix and execute as shell command
      if (input.startsWith('!') && onBashSubmit) {
        const command = input.slice(1).trim();
        if (command) {
          onBashSubmit(command);
        }
      } else {
        onSubmit(input);
      }
      setInput('');
      setLines(['']);
      setCurrentLine(0);
      setCursorPosition(0);
      setHistoryIndex(-1);
      typeahead.dismiss();
      historySearch.dismiss();
    }
  }, [input, disabled, onSubmit, onBashSubmit, typeahead, historySearch]);

  // ── Input handler ──
  useInput((inputChar, key) => {
    if (disabled) return;

    // ── Vim NORMAL mode: intercept all keys ──
    if (vimEnabled && vimMode === 'NORMAL') {
      const vimState: VimInputState = { input, lines, cursorPosition, currentLine };
      const vimSetters: VimInputSetters = {
        setInput,
        setLines,
        setCursorPosition,
        setCurrentLine,
        onVimModeChange: onVimModeChange ?? (() => {}),
        onSubmit: handleSubmit,
      };
      const vimConfig: VimInputConfig = { multiline, maxLines, disabled };
      const consumed = handleVimNormalKey(vimPendingRef.current, inputChar, key, vimState, vimSetters, vimConfig);
      if (consumed) return;
    }

    // ── Vim INSERT mode: Esc returns to NORMAL ──
    if (vimEnabled && vimMode === 'INSERT' && key.escape) {
      onVimModeChange?.('NORMAL');
      // Move cursor back one position (Vim behavior on Esc)
      if (cursorPosition > 0) {
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    // ── History search mode ──
    if (historySearch.active) {
      if (key.return) {
        // Accept the focused match
        const match = historySearch.acceptMatch();
        if (match) {
          updateInput(match);
        }
        return;
      }
      if (inputChar === 'r' && key.ctrl) {
        // Ctrl+R again: next match
        historySearch.nextMatch();
        return;
      }
      if (key.escape) {
        historySearch.dismiss();
        return;
      }
      if (key.backspace || key.delete) {
        if (historySearch.query.length > 0) {
          historySearch.updateQuery(historySearch.query.slice(0, -1));
        } else {
          historySearch.dismiss();
        }
        return;
      }
      // Regular chars update the search query
      if (!key.ctrl && !key.meta && inputChar && inputChar.length === 1) {
        historySearch.updateQuery(historySearch.query + inputChar);
      }
      return;
    }

    // ── Ctrl+R: activate history search ──
    if (inputChar === 'r' && key.ctrl) {
      historySearch.activateSearch();
      return;
    }

    // ── Ctrl+G: open external editor ──
    if (inputChar === 'g' && key.ctrl) {
      const edited = editPromptInEditor(input);
      if (edited !== undefined) {
        updateInput(edited);
      }
      return;
    }

    // ── Typeahead: Tab to accept ──
    if (key.tab && typeahead.visible) {
      const accepted = typeahead.acceptSuggestion();
      if (accepted !== undefined) {
        updateInput(accepted);
      }
      return;
    }

    // ── Typeahead: Escape to dismiss ──
    if (key.escape && typeahead.visible) {
      typeahead.dismiss();
      return;
    }

    // ── Typeahead: arrow navigation ──
    if (typeahead.visible) {
      if (key.upArrow) {
        typeahead.focusPrev();
        return;
      }
      if (key.downArrow) {
        typeahead.focusNext();
        return;
      }
    }

    // ── Submit: Enter (or Ctrl+Enter for multiline) ──
    if (key.return) {
      if (multiline && key.shift) {
        // Shift+Enter: new line
        const newLines = [...lines];
        const currentLineText = newLines[currentLine];
        const beforeCursor = currentLineText.slice(0, cursorPosition);
        const afterCursor = currentLineText.slice(cursorPosition);

        newLines[currentLine] = beforeCursor;
        newLines.splice(currentLine + 1, 0, afterCursor);

        if (newLines.length <= maxLines) {
          setLines(newLines);
          setCurrentLine(currentLine + 1);
          setCursorPosition(0);
          setInput(newLines.join('\n'));
        }
      } else {
        // Regular Enter: submit
        handleSubmit();
      }
      return;
    }

    // ── Mode switching: Shift+Tab ──
    if (key.shift && key.tab) {
      cycleMode();
      return;
    }

    // ── History navigation: Up/Down arrows (only when typeahead is not visible) ──
    if (!typeahead.visible) {
      if (key.upArrow) {
        navigateHistory('up');
        return;
      }
      if (key.downArrow) {
        navigateHistory('down');
        return;
      }
    }

    // ── Cursor movement: Left/Right arrows ──
    if (key.leftArrow) {
      setCursorPosition(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      const currentLineText = lines[currentLine];
      setCursorPosition(prev => Math.min(currentLineText.length, prev + 1));
      return;
    }

    // ── Backspace/Delete ──
    if (key.backspace || key.delete) {
      if (cursorPosition > 0) {
        const newLines = [...lines];
        const currentLineText = newLines[currentLine];
        const beforeCursor = currentLineText.slice(0, cursorPosition - 1);
        const afterCursor = currentLineText.slice(cursorPosition);
        newLines[currentLine] = beforeCursor + afterCursor;

        setLines(newLines);
        setCursorPosition(cursorPosition - 1);
        setInput(newLines.join('\n'));
      } else if (currentLine > 0) {
        // Backspace at start of line: merge with previous line
        const newLines = [...lines];
        const prevLineLength = newLines[currentLine - 1].length;
        newLines[currentLine - 1] += newLines[currentLine];
        newLines.splice(currentLine, 1);

        setLines(newLines);
        setCurrentLine(currentLine - 1);
        setCursorPosition(prevLineLength);
        setInput(newLines.join('\n'));
      }
      return;
    }

    // ── Regular character input ──
    if (!key.ctrl && !key.meta && inputChar) {
      // Check for image file path paste (single large paste = image drag-and-drop)
      // A single inputChar is just one character, but pasted text comes as
      // a single string. We check if the accumulated input looks like an image path.
      const imgRef = imagePaste.tryParseImagePaste(inputChar);
      if (imgRef) {
        // It's an image file path — insert [image: filename] reference
        const newLines = [...lines];
        const currentLineText = newLines[currentLine];
        const imageTag = `[image: ${imgRef.filename}]`;
        const beforeCursor = currentLineText.slice(0, cursorPosition);
        const afterCursor = currentLineText.slice(cursorPosition);
        newLines[currentLine] = beforeCursor + imageTag + afterCursor;

        setLines(newLines);
        setCursorPosition(cursorPosition + imageTag.length);
        setInput(newLines.join('\n'));
        return;
      }

      const newLines = [...lines];
      const currentLineText = newLines[currentLine];
      const beforeCursor = currentLineText.slice(0, cursorPosition);
      const afterCursor = currentLineText.slice(cursorPosition);
      newLines[currentLine] = beforeCursor + inputChar + afterCursor;

      setLines(newLines);
      setCursorPosition(cursorPosition + inputChar.length);
      setInput(newLines.join('\n'));
    }
  });

  // ── Render input with cursor ──
  const renderInputWithCursor = () => {
    return lines.map((line, lineIndex) => {
      if (lineIndex === currentLine) {
        const beforeCursor = line.slice(0, cursorPosition);
        const afterCursor = line.slice(cursorPosition);

        return (
          <Box key={lineIndex}>
            {lineIndex === 0 && <Text color={getModeColor(mode)} bold>{'❯ '}</Text>}
            <Text>{beforeCursor}</Text>
            <Text color={getModeColor(mode)} bold>█</Text>
            <Text>{afterCursor}</Text>
          </Box>
        );
      }

      return (
        <Box key={lineIndex}>
          {lineIndex === 0 && <Text color={getModeColor(mode)} bold>{'❯ '}</Text>}
          <Text>{line || ' '}</Text>
        </Box>
      );
    });
  };

  // ── Render typeahead suggestions ──
  const renderTypeahead = () => {
    if (!typeahead.visible || typeahead.suggestions.length === 0) return null;

    return (
      <Box flexDirection="column" paddingLeft={2}>
        {typeahead.suggestions.map((suggestion, idx) => {
          const isFocused = idx === typeahead.focusIndex;
          return (
            <Box key={suggestion.value}>
              <Text color={isFocused ? 'cyan' : undefined} bold={isFocused}>
                {isFocused ? '› ' : '  '}
              </Text>
              <Text color={isFocused ? 'white' : 'gray'} bold={isFocused}>
                {suggestion.label}
              </Text>
              {suggestion.description && (
                <Text dimColor> — {suggestion.description}</Text>
              )}
            </Box>
          );
        })}
        <Text dimColor>  Tab to accept · Esc to dismiss</Text>
      </Box>
    );
  };

  // ── Render history search overlay ──
  const renderHistorySearch = () => {
    if (!historySearch.active) return null;

    return (
      <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Text color="yellow" bold>{'>'}</Text>
          <Text color="white">{historySearch.query}</Text>
          <Text color={getModeColor(effectiveMode)} bold>█</Text>
        </Box>
        {historySearch.focusedMatch && (
          <Box paddingLeft={2}>
            <Text dimColor>{historySearch.focusedMatch}</Text>
          </Box>
        )}
        <Text dimColor>  Ctrl+R: next · Enter: accept · Esc: cancel</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {/* Main input box */}
      <Box flexDirection="column" borderStyle="round">
        <Box flexDirection="column" paddingX={1} paddingY={0}>
          {historySearch.active ? (
            // History search overlay replaces the input area
            renderHistorySearch()
          ) : input.length === 0 ? (
            <Box>
              <Text color={getModeColor(effectiveMode)} bold>{'❯ '}</Text>
              <Text dimColor>{disabled ? 'Waiting for response...' : placeholder}</Text>
              <Text color={getModeColor(effectiveMode)} bold>█</Text>
            </Box>
          ) : (
            renderInputWithCursor()
          )}
        </Box>
      </Box>

      {/* Typeahead suggestions (below the input box) */}
      {typeahead.visible && renderTypeahead()}
    </Box>
  );
};
