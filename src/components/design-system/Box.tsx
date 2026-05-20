/**
 * Box component - Layout container
 * Wrapper around Ink's Box with consistent styling and TypeScript types
 */

import React from 'react';
import { Box as InkBox } from 'ink';

export interface BoxProps {
  children?: React.ReactNode;
  
  // Layout
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'auto';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  
  // Spacing
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  
  // Dimensions
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  
  // Border
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
  borderColor?: string;
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
  
  // Display
  display?: 'flex' | 'none';
  overflow?: 'visible' | 'hidden';
  
  // Gap
  gap?: number;
  columnGap?: number;
  rowGap?: number;
}

/**
 * Box component for layout and spacing
 * 
 * @example
 * ```tsx
 * <Box flexDirection="column" padding={2}>
 *   <Text>Content</Text>
 * </Box>
 * ```
 */
export const Box: React.FC<BoxProps> = ({ children, ...props }) => {
  return <InkBox {...props}>{children}</InkBox>;
};
