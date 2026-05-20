/**
 * Theme exports
 * Provides color scheme and theming utilities
 */

export { colors, type ColorName, type ColorValue } from './colors.js';
export {
  getTheme,
  setTheme,
  setCustomTheme,
  listThemes,
  createCustomTheme,
  darkTheme,
  lightTheme,
  type Theme,
  type ThemeMode,
  type ThemeColors,
} from './theme.js';
