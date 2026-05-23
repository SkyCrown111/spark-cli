/**
 * Byline — a secondary/descriptive line of text, usually below a heading.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface BylineProps {
  /** Text content */
  text: string;
  /** Color (default: dim gray) */
  color?: string;
  /** Whether to dim the text */
  dimColor?: boolean;
}

export const Byline: React.FC<BylineProps> = ({ text, color, dimColor = true }) => {
  return (
    <Box>
      <Text dimColor={dimColor} color={color}>
        {text}
      </Text>
    </Box>
  );
};
