/**
 * Pane — a bordered panel container for Ink.
 * Provides consistent border styling, padding, and header support.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface PaneProps {
  /** Border style */
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'none';
  /** Border color */
  borderColor?: string;
  /** Padding horizontal */
  paddingX?: number;
  /** Padding vertical */
  paddingY?: number;
  /** Title text shown in top border */
  title?: string;
  /** Width (default: auto) */
  width?: number | string;
  /** Children */
  children: React.ReactNode;
}

export const Pane: React.FC<PaneProps> = ({
  borderStyle = 'single',
  borderColor = 'gray',
  paddingX = 1,
  paddingY = 0,
  title,
  width,
  children,
}) => {
  const borderProps = borderStyle !== 'none' ? { borderStyle, borderColor } : {};

  return (
    <Box
      flexDirection="column"
      width={width}
      paddingX={paddingX}
      paddingY={paddingY}
      {...borderProps}
    >
      {title && (
        <Box paddingBottom={1}>
          <Text bold color={borderColor}>
            {title}
          </Text>
        </Box>
      )}
      {children}
    </Box>
  );
};
