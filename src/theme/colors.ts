/**
 * Color scheme for SparkCLI UI
 * Provides consistent color palette across all components
 */

export const colors = {
  // Primary colors
  primary: 'cyan',
  secondary: 'blue',
  
  // Status colors
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  
  // UI colors
  muted: 'gray',
  text: 'white',
  background: 'black',
  
  // Role-specific colors
  user: 'cyan',
  assistant: 'green',
  tool: 'magenta',
  system: 'yellow',
} as const;

export type ColorName = keyof typeof colors;
export type ColorValue = typeof colors[ColorName];
