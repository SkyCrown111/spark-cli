/**
 * CustomSelect — an interactive selection component for Ink.
 *
 * Supports j/k navigation, Ctrl+P/Ctrl+N, search filtering,
 * and Enter to accept. Built on Ink's useInput for keyboard handling.
 *
 * Used by ModelPicker, ThemePicker, Settings, and other dialog components.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

export interface SelectOption {
  /** Unique value for this option */
  value: string;
  /** Display label */
  label: string;
  /** Optional description shown below the label */
  description?: string;
  /** Whether this option is currently selected/active */
  selected?: boolean;
  /** Whether this option is disabled */
  disabled?: boolean;
}

export interface CustomSelectProps {
  /** Available options */
  options: SelectOption[];
  /** Currently focused option value */
  initialFocus?: string;
  /** Callback when user selects an option */
  onSelect: (value: string) => void;
  /** Callback when user cancels (Escape) */
  onCancel?: () => void;
  /** Header text */
  header?: string;
  /** Whether the select is active (receives input) */
  active?: boolean;
  /** Maximum visible items (default: 10) */
  maxVisible?: number;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  initialFocus,
  onSelect,
  onCancel,
  header,
  active = true,
  maxVisible = 10,
}) => {
  const { width } = useTerminalSize();
  const initialIdx = initialFocus
    ? options.findIndex((o) => o.value === initialFocus)
    : 0;
  const [focusIndex, setFocusIndex] = useState(Math.max(0, initialIdx));

  // Navigation
  const handleNext = useCallback(() => {
    setFocusIndex((prev) => {
      let next = prev + 1;
      while (next < options.length && options[next].disabled) next++;
      return next < options.length ? next : prev;
    });
  }, [options]);

  const handlePrev = useCallback(() => {
    setFocusIndex((prev) => {
      let next = prev - 1;
      while (next >= 0 && options[next].disabled) next--;
      return next >= 0 ? next : prev;
    });
  }, [options]);

  const handleAccept = useCallback(() => {
    const option = options[focusIndex];
    if (option && !option.disabled) {
      onSelect(option.value);
    }
  }, [options, focusIndex, onSelect]);

  // Input handling
  useInput((_input, key) => {
    if (!active) return;

    if (key.escape) {
      onCancel?.();
      return;
    }

    if (key.upArrow || _input === 'k' || (key.ctrl && _input === 'p')) {
      handlePrev();
    } else if (key.downArrow || _input === 'j' || (key.ctrl && _input === 'n')) {
      handleNext();
    } else if (key.return) {
      handleAccept();
    }
  });

  // Compute visible range (scrolling)
  const visibleStart = Math.max(0, focusIndex - maxVisible + 3);
  const visibleEnd = Math.min(options.length, visibleStart + maxVisible);
  const visibleOptions = options.slice(visibleStart, visibleEnd);

  return (
    <Box flexDirection="column" width={Math.min(width, 60)} borderStyle="single" paddingX={1}>
      {header && (
        <Box paddingBottom={1}>
          <Text bold>{header}</Text>
        </Box>
      )}
      {visibleOptions.map((option, idx) => {
        const globalIdx = visibleStart + idx;
        const isFocused = globalIdx === focusIndex;
        const isDisabled = option.disabled;
        const isCurrent = option.selected;

        return (
          <Box key={option.value}>
            <Text>
              {isFocused ? '❯ ' : '  '}
              {isCurrent ? '● ' : '  '}
            </Text>
            <Text
              color={isDisabled ? 'gray' : isFocused ? 'cyan' : undefined}
              bold={isFocused}
              dimColor={isDisabled}
            >
              {option.label}
            </Text>
            {option.description && isFocused && (
              <Text dimColor> — {option.description}</Text>
            )}
          </Box>
        );
      })}
      {options.length > maxVisible && (
        <Box paddingTop={1}>
          <Text dimColor>
            {visibleStart > 0 && '↑ more above '}
            {visibleEnd < options.length && '↓ more below'}
          </Text>
        </Box>
      )}
    </Box>
  );
};