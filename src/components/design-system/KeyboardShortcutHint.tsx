/**
 * KeyboardShortcutHint — displays a keyboard shortcut with a key badge
 * and description, similar to VS Code's keyboard hint bubbles.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface KeyboardShortcutHintProps {
  /** Key combination (e.g., "Ctrl+C", "Shift+Tab") */
  keyCombo: string;
  /** Description of what the shortcut does */
  description: string;
  /** Whether this hint is currently active/contextual */
  active?: boolean;
}

export const KeyboardShortcutHint: React.FC<KeyboardShortcutHintProps> = ({
  keyCombo,
  description,
  active = true,
}) => {
  return (
    <Box gap={1}>
      <Text
        backgroundColor={active ? 'gray' : undefined}
        color={active ? 'white' : 'gray'}
      >
        {` ${keyCombo} `}
      </Text>
      <Text dimColor={!active}>{description}</Text>
    </Box>
  );
};