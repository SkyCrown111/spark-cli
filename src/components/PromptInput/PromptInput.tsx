/**
 * PromptInput component - Main input component for user prompts.
 *
 * Supports multi-line input, cursor movement, mode switching,
 * input history, typeahead (/slash commands, @files), history
 * search (Ctrl+R), and external editor (Ctrl+G).
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useInput } from 'ink';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { useTypeahead } from '../../hooks/useTypeahead.js';
import { useHistorySearch } from '../../hooks/useHistorySearch.js';
import { useImagePaste } from '../../hooks/useImagePaste.js';
import { editPromptInEditor } from '../../utils/promptEditor.js';
import {
  filterFileSuggestions,
  getFileSuggestions,
  type FileSuggestion,
} from '../../utils/suggestions/fileSuggestions.js';
import type { SuggestionItem } from '../../utils/suggestions/commandSuggestions.js';
import {
  handleVimNormalKey,
  type VimInputState,
  type VimInputSetters,
  type VimInputConfig,
} from './VimTextInput.js';
import type { VimMode } from '../../state/AppState.js';

export type InputMode = 'chat' | 'direct' | 'plan' | 'bash';

export interface PromptInputProps {
  onSubmit: (text: string) => void;
  onBashSubmit?: (command: string) => void;
  placeholder?: string;
  mode?: InputMode;
  onModeChange?: (mode: InputMode) => void;
  disabled?: boolean;
  history?: string[];
  onHistoryNavigate?: (index: number) => void;
  multiline?: boolean;
  maxLines?: number;
  projectRoot?: string;
  vimEnabled?: boolean;
  vimMode?: VimMode;
  onVimModeChange?: (mode: VimMode) => void;
  onImagePaste?: (image: {
    id: string;
    filename: string;
    filePath: string;
    extension: string;
    size: number;
  }) => void;
  commandSuggestions?: Array<{
    value: string;
    label: string;
    description?: string;
    category?: string;
  }>;
  gitSuggestions?: Array<{ value: string; label: string; source: string }>;
}

const PINK = '#F472B6';
const PINK_SOFT = '#F9A8D4';
const PINK_DEEP = '#EC4899';
const BORDER = '#A1A1AA';
const BORDER_ACTIVE = '#F472B6';
const PLACEHOLDER = '#71717A';
const PROMPT = '>';
const CURSOR = '|';

function getModeColor(m: InputMode): string {
  switch (m) {
    case 'chat':
      return PINK;
    case 'direct':
      return PINK_SOFT;
    case 'plan':
      return PINK_DEEP;
    case 'bash':
      return '#E879F9';
    default:
      return PINK;
  }
}

function getModeLabel(m: InputMode): string {
  switch (m) {
    case 'chat':
      return 'Chat';
    case 'direct':
      return 'Direct';
    case 'plan':
      return 'Plan';
    case 'bash':
      return 'Shell';
    default:
      return 'Chat';
  }
}

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
  commandSuggestions,
  gitSuggestions = [],
}) => {
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);

  const vimPendingRef = useRef({});
  const yankRingRef = useRef<string[]>([]);
  const yankIndexRef = useRef(-1);
  const lastEscTimeRef = useRef(0);
  const escCountRef = useRef(0);
  const lastInputTimeRef = useRef(0);
  const PASTE_THRESHOLD_MS = 50;

  const typeahead = useTypeahead();
  const historySearch = useHistorySearch(history);
  const imagePaste = useImagePaste({ onImagePaste });
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

  const updateInput = useCallback((newInput: string) => {
    const newLines = newInput.split('\n');
    setInput(newInput);
    setLines(newLines);
    setCurrentLine(newLines.length - 1);
    setCursorPosition(newLines[newLines.length - 1].length);
  }, []);

  useEffect(() => {
    if (historySearch.active) return;

    if (input.startsWith('/')) {
      typeahead.updateCommandSuggestions(input, commandSuggestions);
    } else if (input.includes('@')) {
      const lastAtIndex = input.lastIndexOf('@');
      const beforeAt = input.slice(0, lastAtIndex);
      if (lastAtIndex === 0 || beforeAt.endsWith(' ') || beforeAt.endsWith('\n')) {
        const query = input.slice(lastAtIndex + 1);
        const files = getFileSuggestionsCached();
        const filtered = filterFileSuggestions(files, query);
        const items: SuggestionItem[] = filtered.map((f) => ({
          value: beforeAt + '@' + f.value,
          label: '@' + f.label,
          description: f.extension,
          category: 'file',
        }));
        typeahead.updateFileSuggestions(query, items);
      } else {
        typeahead.dismiss();
      }
    } else {
      typeahead.dismiss();
    }
  }, [input, historySearch.active, commandSuggestions]);

  const effectiveMode: InputMode = input.startsWith('!') && !disabled ? 'bash' : mode;

  const cycleMode = useCallback(() => {
    if (!onModeChange) return;
    const modes: InputMode[] = ['chat', 'direct', 'plan'];
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    onModeChange(modes[nextIndex]);
  }, [mode, onModeChange]);

  const navigateHistory = useCallback(
    (direction: 'up' | 'down') => {
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

      onHistoryNavigate?.(newIndex);
    },
    [history, historyIndex, onHistoryNavigate, updateInput],
  );

  const handleSubmit = useCallback(() => {
    if (input.trim() && !disabled) {
      if (input.startsWith('!') && onBashSubmit) {
        const command = input.slice(1).trim();
        if (command) onBashSubmit(command);
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

  useInput((inputChar, key) => {
    if (disabled) return;

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
      const consumed = handleVimNormalKey(
        vimPendingRef.current,
        inputChar,
        key,
        vimState,
        vimSetters,
        vimConfig,
      );
      if (consumed) return;
    }

    if (vimEnabled && vimMode === 'INSERT' && key.escape) {
      onVimModeChange?.('NORMAL');
      if (cursorPosition > 0) setCursorPosition(cursorPosition - 1);
      return;
    }

    if (key.escape && !vimEnabled && !typeahead.visible && !historySearch.active) {
      const now = Date.now();
      const timeSinceLastEsc = now - lastEscTimeRef.current;
      lastEscTimeRef.current = now;

      if (input.length > 0) {
        setInput('');
        setLines(['']);
        setCurrentLine(0);
        setCursorPosition(0);
        escCountRef.current = 1;
        return;
      }

      if (timeSinceLastEsc < 300 && escCountRef.current >= 1) {
        escCountRef.current = 0;
        return;
      }

      escCountRef.current = 1;
      return;
    }

    if (historySearch.active) {
      if (key.return) {
        const match = historySearch.acceptMatch();
        if (match) updateInput(match);
        return;
      }
      if (inputChar === 'r' && key.ctrl) {
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
      if (!key.ctrl && !key.meta && inputChar && inputChar.length === 1) {
        historySearch.updateQuery(historySearch.query + inputChar);
      }
      return;
    }

    if (inputChar === 'r' && key.ctrl) {
      historySearch.activateSearch();
      return;
    }

    if (inputChar === 'g' && key.ctrl) {
      const edited = editPromptInEditor(input);
      if (edited !== undefined) updateInput(edited);
      return;
    }

    if (key.tab && typeahead.visible) {
      const accepted = typeahead.acceptSuggestion();
      if (accepted !== undefined) updateInput(accepted);
      return;
    }

    if (key.escape && typeahead.visible) {
      typeahead.dismiss();
      return;
    }

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

    if (key.return) {
      if (multiline && input.endsWith('\\')) {
        const newLines = [...lines];
        const currentLineText = newLines[currentLine];
        newLines[currentLine] = currentLineText.slice(0, -1);
        newLines.splice(currentLine + 1, 0, '');
        if (newLines.length <= maxLines) {
          setLines(newLines);
          setCurrentLine(currentLine + 1);
          setCursorPosition(0);
          setInput(newLines.join('\n'));
        }
        return;
      }
      if (multiline && (key.shift || key.meta)) {
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
        handleSubmit();
      }
      return;
    }

    if (key.shift && key.tab) {
      cycleMode();
      return;
    }

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

    if (key.leftArrow) {
      setCursorPosition((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      const currentLineText = lines[currentLine];
      setCursorPosition((prev) => Math.min(currentLineText.length, prev + 1));
      return;
    }

    if (key.home || (inputChar === 'a' && key.ctrl)) {
      setCursorPosition(0);
      return;
    }
    if (key.end || (inputChar === 'e' && key.ctrl)) {
      setCursorPosition(lines[currentLine].length);
      return;
    }

    if (inputChar === 'w' && key.ctrl) {
      const currentLineText = lines[currentLine];
      const before = currentLineText.slice(0, cursorPosition);
      const after = currentLineText.slice(cursorPosition);
      const trimmed = before.trimEnd();
      const lastSpace = trimmed.lastIndexOf(' ');
      const newBefore = lastSpace === -1 ? '' : before.slice(0, lastSpace + 1);
      const deleted = before.slice(lastSpace + 1);
      if (deleted) {
        yankRingRef.current.push(deleted);
        if (yankRingRef.current.length > 20) yankRingRef.current.shift();
      }
      const newLines = [...lines];
      newLines[currentLine] = newBefore + after;
      setLines(newLines);
      setCursorPosition(newBefore.length);
      setInput(newLines.join('\n'));
      return;
    }

    if (inputChar === 'u' && key.ctrl) {
      const currentLineText = lines[currentLine];
      const deleted = currentLineText.slice(0, cursorPosition);
      if (deleted) {
        yankRingRef.current.push(deleted);
        if (yankRingRef.current.length > 20) yankRingRef.current.shift();
      }
      const newLines = [...lines];
      newLines[currentLine] = newLines[currentLine].slice(cursorPosition);
      setLines(newLines);
      setCursorPosition(0);
      setInput(newLines.join('\n'));
      return;
    }

    if (inputChar === 'k' && key.ctrl) {
      const currentLineText = lines[currentLine];
      const deleted = currentLineText.slice(cursorPosition);
      if (deleted) {
        yankRingRef.current.push(deleted);
        if (yankRingRef.current.length > 20) yankRingRef.current.shift();
      }
      const newLines = [...lines];
      newLines[currentLine] = newLines[currentLine].slice(0, cursorPosition);
      setLines(newLines);
      setInput(newLines.join('\n'));
      return;
    }

    if (inputChar === 'y' && key.ctrl) {
      if (yankRingRef.current.length === 0) return;
      yankIndexRef.current = yankRingRef.current.length - 1;
      const text = yankRingRef.current[yankIndexRef.current];
      const newLines = [...lines];
      const currentLineText = newLines[currentLine];
      const beforeCursor = currentLineText.slice(0, cursorPosition);
      const afterCursor = currentLineText.slice(cursorPosition);
      const yankLines = text.split('\n');
      if (yankLines.length === 1) {
        newLines[currentLine] = beforeCursor + text + afterCursor;
        setLines(newLines);
        setCursorPosition(cursorPosition + text.length);
      } else {
        newLines[currentLine] = beforeCursor + yankLines[0];
        for (let i = 1; i < yankLines.length; i++) {
          newLines.splice(currentLine + i, 0, yankLines[i]);
        }
        const lastYankLine = yankLines[yankLines.length - 1];
        const mergeIndex = currentLine + yankLines.length - 1;
        newLines[mergeIndex] = lastYankLine + (mergeIndex === currentLine ? afterCursor : '');
        setLines(newLines);
        setCursorPosition(lastYankLine.length);
      }
      setInput(newLines.join('\n'));
      return;
    }

    if (inputChar === 'y' && key.meta) {
      if (yankRingRef.current.length === 0) return;
      yankIndexRef.current =
        (yankIndexRef.current - 1 + yankRingRef.current.length) % yankRingRef.current.length;
      const text = yankRingRef.current[yankIndexRef.current];
      const newLines = [...lines];
      newLines[currentLine] = text;
      setLines(newLines);
      setCursorPosition(text.length);
      setInput(newLines.join('\n'));
      return;
    }

    if (inputChar === 'b' && key.meta) {
      const currentLineText = lines[currentLine];
      const before = currentLineText.slice(0, cursorPosition);
      const trimmed = before.trimEnd();
      if (trimmed.length === 0) {
        setCursorPosition(0);
      } else {
        let lastSpace = -1;
        for (let i = trimmed.length - 1; i >= 0; i--) {
          if (trimmed[i] === ' ' || trimmed[i] === '\t') {
            lastSpace = i;
            break;
          }
        }
        setCursorPosition(lastSpace + 1);
      }
      return;
    }

    if (inputChar === 'f' && key.meta) {
      const currentLineText = lines[currentLine];
      const after = currentLineText.slice(cursorPosition);
      let firstNonSpace = -1;
      for (let i = 0; i < after.length; i++) {
        if (after[i] !== ' ' && after[i] !== '\t') {
          firstNonSpace = i;
          break;
        }
      }
      if (firstNonSpace === -1) {
        setCursorPosition(currentLineText.length);
      } else {
        let wordEnd = after.length;
        for (let i = firstNonSpace + 1; i < after.length; i++) {
          if (after[i] === ' ' || after[i] === '\t') {
            wordEnd = i;
            break;
          }
        }
        setCursorPosition(cursorPosition + wordEnd);
      }
      return;
    }

    if (inputChar === 'j' && key.ctrl && multiline) {
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
      return;
    }

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

    if (!key.ctrl && !key.meta && inputChar) {
      const imgRef = imagePaste.tryParseImagePaste(inputChar);
      if (imgRef) {
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

      const now = Date.now();
      const timeSinceLastInput = now - lastInputTimeRef.current;
      lastInputTimeRef.current = now;
      const isPaste = inputChar.length > 1 || timeSinceLastInput < PASTE_THRESHOLD_MS;

      if (isPaste && inputChar.includes('\n') && multiline) {
        const pasteLines = inputChar.split('\n');
        const newLines = [...lines];
        const currentLineText = newLines[currentLine];
        const beforeCursor = currentLineText.slice(0, cursorPosition);
        const afterCursor = currentLineText.slice(cursorPosition);
        newLines[currentLine] = beforeCursor + pasteLines[0];
        for (let i = 1; i < pasteLines.length; i++) {
          newLines.splice(currentLine + i, 0, pasteLines[i]);
        }
        const lastPasteLineIdx = currentLine + pasteLines.length - 1;
        newLines[lastPasteLineIdx] += afterCursor;
        if (newLines.length > maxLines) newLines.length = maxLines;
        setLines(newLines);
        setCurrentLine(Math.min(lastPasteLineIdx, maxLines - 1));
        setCursorPosition(
          newLines[Math.min(lastPasteLineIdx, maxLines - 1)].length - afterCursor.length,
        );
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

  const renderInputWithCursor = () => {
    return lines.map((line, lineIndex) => {
      if (lineIndex === currentLine) {
        const beforeCursor = line.slice(0, cursorPosition);
        const afterCursor = line.slice(cursorPosition);
        return (
          <Box key={lineIndex}>
            {lineIndex === 0 && (
              <Text color={getModeColor(effectiveMode)} bold>{`${PROMPT} `}</Text>
            )}
            <Text color="white">{beforeCursor}</Text>
            <Text color={getModeColor(effectiveMode)} bold>
              {CURSOR}
            </Text>
            <Text color="white">{afterCursor}</Text>
          </Box>
        );
      }

      return (
        <Box key={lineIndex}>
          {lineIndex === 0 && <Text color={getModeColor(effectiveMode)} bold>{`${PROMPT} `}</Text>}
          <Text color="white">{line || ' '}</Text>
        </Box>
      );
    });
  };

  const renderTypeahead = () => {
    if (!typeahead.visible || typeahead.suggestions.length === 0) return null;

    const maxLabelLen = Math.min(24, Math.max(...typeahead.suggestions.map((s) => s.label.length)));
    const borderColor = typeahead.kind === 'file' ? PINK_SOFT : BORDER_ACTIVE;
    const header = typeahead.kind === 'file' ? 'Files' : 'Commands';

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        width="100%"
        marginTop={1}
        paddingLeft={0}
        paddingRight={1}
      >
        <Box paddingLeft={1}>
          <Text color={PINK_SOFT}>
            {header} ({typeahead.suggestions.length})
          </Text>
        </Box>
        {typeahead.suggestions.slice(0, 8).map((suggestion, idx) => {
          const isFocused = idx === typeahead.focusIndex;
          return (
            <Box key={suggestion.value} paddingLeft={1}>
              <Text color={isFocused ? borderColor : PLACEHOLDER} bold={isFocused}>
                {isFocused ? '> ' : '  '}
              </Text>
              <Text color={isFocused ? 'white' : '#D4D4D8'} bold={isFocused}>
                {suggestion.label.padEnd(maxLabelLen)}
              </Text>
              {suggestion.description && <Text color={PLACEHOLDER}> {suggestion.description}</Text>}
            </Box>
          );
        })}
        {typeahead.suggestions.length > 8 && (
          <Box paddingLeft={1}>
            <Text color={PLACEHOLDER}> +{typeahead.suggestions.length - 8} more</Text>
          </Box>
        )}
        <Box paddingLeft={1}>
          <Text color={PLACEHOLDER}>Tab accept * Esc dismiss * Up/Down navigate</Text>
        </Box>
      </Box>
    );
  };

  const renderHistorySearch = () => {
    if (!historySearch.active) return null;
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PINK_SOFT}
        width="100%"
        paddingX={1}
      >
        <Box flexDirection="row" gap={1}>
          <Text color={PINK_SOFT} bold>
            {PROMPT}
          </Text>
          <Text color="white">{historySearch.query}</Text>
          <Text color={getModeColor(effectiveMode)} bold>
            {CURSOR}
          </Text>
        </Box>
        {historySearch.focusedMatch && (
          <Box paddingLeft={2}>
            <Text color={PLACEHOLDER}>{historySearch.focusedMatch}</Text>
          </Box>
        )}
        <Text color={PLACEHOLDER}>Ctrl+R next * Enter accept * Esc cancel</Text>
      </Box>
    );
  };

  const renderGitSuggestions = () => {
    if (input.length > 0 || gitSuggestions.length === 0 || disabled) return null;
    return (
      <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
        <Text color={PLACEHOLDER}>Suggestions</Text>
        {gitSuggestions.slice(0, 3).map((suggestion) => (
          <Box key={suggestion.source} paddingLeft={1}>
            <Text color={PLACEHOLDER}>{'> '}</Text>
            <Text color="#A1A1AA">{suggestion.label}</Text>
          </Box>
        ))}
        <Text color={PLACEHOLDER}>{'  Tab to accept'}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="round"
        borderColor={disabled || input.length === 0 ? BORDER : BORDER_ACTIVE}
      >
        <Box flexDirection="column" width="100%" paddingX={1} paddingY={0}>
          <Box paddingLeft={1} paddingTop={0}>
            <Text color={PLACEHOLDER}>{getModeLabel(effectiveMode)}</Text>
          </Box>
          {historySearch.active ? (
            renderHistorySearch()
          ) : input.length === 0 ? (
            <Box paddingLeft={1}>
              <Text color={getModeColor(effectiveMode)} bold>{`${PROMPT} `}</Text>
              <Text color={disabled ? '#A1A1AA' : PLACEHOLDER}>
                {disabled ? 'Waiting for response...' : placeholder}
              </Text>
              <Text color={getModeColor(effectiveMode)} bold>
                {CURSOR}
              </Text>
            </Box>
          ) : (
            <Box paddingLeft={1} flexDirection="column">
              {renderInputWithCursor()}
            </Box>
          )}
        </Box>
      </Box>
      {renderGitSuggestions()}
      {typeahead.visible && renderTypeahead()}
    </Box>
  );
};
