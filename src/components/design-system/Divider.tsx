/**
 * Divider — a horizontal separator line for Ink.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface DividerProps {
  /** Divider character (default: ─) */
  char?: string;
  /** Color */
  color?: string;
  /** Width (default: full) */
  width?: number;
  /** Label text centered on the divider */
  label?: string;
}

export const Divider: React.FC<DividerProps> = ({
  char = '─',
  color = 'gray',
  width,
  label,
}) => {
  if (label) {
    return (
      <Box justifyContent="center">
        <Text color={color}>{char} {label} {char}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={color}>{char.repeat(width ?? 40)}</Text>
    </Box>
  );
};