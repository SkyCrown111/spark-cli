/**
 * PromptInput component - Main input component for user prompts
 * Supports multi-line input, cursor movement, mode switching, and input history
 */

import React, { useState, useCallback } from 'react';
import { useInput } from 'ink';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';

export type InputMode = 'chat' | 'direct' | 'plan';

export interface PromptInputProps {
  /** Callback when user submits input (presses Enter) */
  onSubmit: (text: string) => void;
  
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
}

/**
 * PromptInput component for user input with advanced features
 * 
 * Features:
 * - Multi-line input support (Shift+Enter)
 * - Cursor movement (Left/Right arrows)
 * - Backspace and Delete
 * - Copy/Paste (Ctrl+C/Ctrl+V when text is selected)
 * - Mode switching (Shift+Tab)
 * - Input history (Up/Down arrows)
 * - Submit on Enter (or Ctrl+Enter for multi-line)
 * 
 * @example
 * ```tsx
 * <PromptInput 
 *   onSubmit={(text) => console.log(text)}
 *   mode="chat"
 *   placeholder="Type your message..."
 * />
 * ```
 */
export const PromptInput: React.FC<PromptInputProps> = ({ 
  onSubmit, 
  placeholder = 'Type your message...',
  mode = 'chat',
  onModeChange,
  disabled = false,
  history = [],
  onHistoryNavigate,
  multiline = true,
  maxLines = 10,
}) => {
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);

  // Mode cycling: chat -> direct -> plan -> chat
  const cycleMode = useCallback(() => {
    if (!onModeChange) return;
    
    const modes: InputMode[] = ['chat', 'direct', 'plan'];
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    onModeChange(modes[nextIndex]);
  }, [mode, onModeChange]);

  // Handle history navigation
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
      setInput(historyText);
      const historyLines = historyText.split('\n');
      setLines(historyLines);
      setCurrentLine(historyLines.length - 1);
      setCursorPosition(historyLines[historyLines.length - 1].length);
    }

    if (onHistoryNavigate) {
      onHistoryNavigate(newIndex);
    }
  }, [history, historyIndex, onHistoryNavigate]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (input.trim() && !disabled) {
      onSubmit(input);
      setInput('');
      setLines(['']);
      setCurrentLine(0);
      setCursorPosition(0);
      setHistoryIndex(-1);
    }
  }, [input, disabled, onSubmit]);

  // Handle input
  useInput((inputChar, key) => {
    if (disabled) return;

    // Submit: Enter (or Ctrl+Enter for multiline)
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

    // Mode switching: Shift+Tab
    if (key.shift && key.tab) {
      cycleMode();
      return;
    }

    // History navigation: Up/Down arrows
    if (key.upArrow) {
      navigateHistory('up');
      return;
    }
    if (key.downArrow) {
      navigateHistory('down');
      return;
    }

    // Cursor movement: Left/Right arrows
    if (key.leftArrow) {
      setCursorPosition(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      const currentLineText = lines[currentLine];
      setCursorPosition(prev => Math.min(currentLineText.length, prev + 1));
      return;
    }

    // Backspace
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

    // Regular character input
    if (!key.ctrl && !key.meta && inputChar) {
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

  // Get mode color
  const getModeColor = (m: InputMode): string => {
    switch (m) {
      case 'chat': return 'cyan';
      case 'direct': return 'green';
      case 'plan': return 'magenta';
      default: return 'white';
    }
  };

  // Render input with cursor
  const renderInputWithCursor = () => {
    return lines.map((line, lineIndex) => {
      if (lineIndex === currentLine) {
        const beforeCursor = line.slice(0, cursorPosition);
        const afterCursor = line.slice(cursorPosition);
        
        return (
          <Box key={lineIndex}>
            <Text>{beforeCursor}</Text>
            <Text color={getModeColor(mode)} bold>█</Text>
            <Text>{afterCursor}</Text>
          </Box>
        );
      }
      
      return (
        <Box key={lineIndex}>
          <Text>{line || ' '}</Text>
        </Box>
      );
    });
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={getModeColor(mode)}>
      <Box paddingX={1} paddingY={0}>
        <Text color={getModeColor(mode)} bold>[{mode}]</Text>
        <Text dimColor> {disabled ? '(disabled)' : ''}</Text>
      </Box>
      
      <Box flexDirection="column" paddingX={1} paddingBottom={1}>
        {input.length === 0 && !disabled ? (
          <Box>
            <Text dimColor>{placeholder}</Text>
            <Text color={getModeColor(mode)} bold>█</Text>
          </Box>
        ) : (
          renderInputWithCursor()
        )}
      </Box>
      
      {multiline && (
        <Box paddingX={1} paddingBottom={0}>
          <Text dimColor>Shift+Enter: new line | Enter: submit | Shift+Tab: mode | ↑↓: history</Text>
        </Box>
      )}
    </Box>
  );
};
