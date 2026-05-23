/**
 * Text component - Text display with styling
 * Wrapper around Ink's Text with consistent styling and TypeScript types
 */

import React from 'react';
import { Text as InkText } from 'ink';
import type { ColorValue } from '../../theme/colors.js';

export interface TextProps {
  children?: React.ReactNode;

  // Color
  color?: ColorValue | string;
  backgroundColor?: ColorValue | string;

  // Style
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;

  // Dimming
  dimColor?: boolean;

  // Wrapping
  wrap?: 'wrap' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end';
}

/**
 * Text component for displaying styled text
 *
 * @example
 * ```tsx
 * <Text color="cyan" bold>Hello World</Text>
 * <Text dimColor>Muted text</Text>
 * <Text wrap="truncate">Long text that will be truncated</Text>
 * ```
 */
export const Text: React.FC<TextProps> = ({ children, ...props }) => {
  return <InkText {...props}>{children}</InkText>;
};
