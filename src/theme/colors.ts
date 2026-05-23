/**
 * Color scheme for SparkCLI UI
 * Provides consistent color palette across all components
 */

export const colors = {
  // Primary colors
  primary: '#F472B6',
  secondary: '#EC4899',

  // Status colors
  success: '#F9A8D4',
  warning: '#FBCFE8',
  error: '#FB7185',
  info: '#F472B6',

  // UI colors
  muted: '#9CA3AF',
  text: 'white',
  background: 'black',

  // Role-specific colors
  user: '#F472B6',
  assistant: '#F9A8D4',
  tool: '#EC4899',
  system: '#FBCFE8',
} as const;

export type ColorName = keyof typeof colors;
export type ColorValue = (typeof colors)[ColorName];
