/**
 * KeybindingHints component - Displays available keyboard shortcuts
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';

export interface KeybindingHint {
  keys: string;
  description: string;
}

export interface KeybindingHintsProps {
  /** Hints to display */
  hints?: KeybindingHint[];
  /** Whether to show the hints */
  visible?: boolean;
}

const defaultHints: KeybindingHint[] = [
  { keys: 'Ctrl+C', description: 'Interrupt' },
  { keys: 'Ctrl+D', description: 'Exit' },
  { keys: 'Ctrl+L', description: 'Clear' },
  { keys: 'Tab', description: 'Autocomplete' },
  { keys: 'Shift+Tab', description: 'Switch mode' },
  { keys: '↑↓', description: 'History' },
];

export const KeybindingHints: React.FC<KeybindingHintsProps> = ({
  hints = defaultHints,
  visible = true,
}) => {
  if (!visible) return null;

  return (
    <Box flexDirection="row" gap={2} paddingX={1}>
      {hints.map((hint, i) => (
        <Box key={i}>
          <Text bold color="cyan">{hint.keys}</Text>
          <Text dimColor> {hint.description}</Text>
        </Box>
      ))}
    </Box>
  );
};
