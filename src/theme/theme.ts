/**
 * Theme system for SparkCLI
 * Supports light/dark modes and custom color schemes.
 * Theme preference is persisted to ~/.spark-cli/config.yaml.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getGlobalConfigPath } from '../config/paths.js';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  muted: string;
  text: string;
  background: string;
  user: string;
  assistant: string;
  tool: string;
  system: string;
  border: string;
  accent: string;
}

export interface Theme {
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
}

const darkTheme: Theme = {
  name: 'dark',
  mode: 'dark',
  colors: {
    primary: 'cyan',
    secondary: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'blue',
    muted: 'gray',
    text: 'white',
    background: 'black',
    user: 'cyan',
    assistant: 'green',
    tool: 'magenta',
    system: 'yellow',
    border: 'gray',
    accent: 'cyan',
  },
};

const lightTheme: Theme = {
  name: 'light',
  mode: 'light',
  colors: {
    primary: 'blue',
    secondary: 'cyan',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'blue',
    muted: 'gray',
    text: 'black',
    background: 'white',
    user: 'blue',
    assistant: 'green',
    tool: 'magenta',
    system: 'yellow',
    border: 'gray',
    accent: 'blue',
  },
};

const builtInThemes: Record<string, Theme> = {
  dark: darkTheme,
  light: lightTheme,
};

let currentTheme: Theme = darkTheme;

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(name: string): boolean {
  const theme = builtInThemes[name];
  if (theme) {
    currentTheme = theme;
    persistThemePreference(name);
    return true;
  }
  return false;
}

/**
 * Persist the theme name to ~/.spark-cli/config.yaml under the `ui.theme` key.
 * This is a simple YAML append — it doesn't restructure the entire config.
 */
function persistThemePreference(themeName: string): void {
  try {
    const configPath = getGlobalConfigPath();
    if (!existsSync(configPath)) return;

    let content = readFileSync(configPath, 'utf8');

    // If ui.theme already exists, replace it; otherwise append it
    if (content.includes('ui:')) {
      // Replace existing theme line under ui block
      content = content.replace(
        /(\bui:\s*\n\s*theme:\s*)(\S+)/,
        `$1${themeName}`,
      );
    } else {
      // Append ui block at the end
      content = content.trimEnd() + `\n\nui:\n  theme: ${themeName}\n`;
    }

    writeFileSync(configPath, content, 'utf8');
  } catch {
    // Silently fail — persistence shouldn't crash the app
  }
}

/**
 * Load the saved theme preference from ~/.spark-cli/config.yaml.
 * Returns undefined if no preference is stored.
 */
export function loadThemePreference(): string | undefined {
  try {
    const configPath = getGlobalConfigPath();
    if (!existsSync(configPath)) return undefined;

    const content = readFileSync(configPath, 'utf8');
    const match = content.match(/theme:\s*(\S+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Initialize the theme from saved preference.
 * Call this at startup to restore the user's theme choice.
 */
export function initThemeFromConfig(): void {
  const saved = loadThemePreference();
  if (saved && builtInThemes[saved]) {
    currentTheme = builtInThemes[saved];
  }
}

export function setCustomTheme(theme: Theme): void {
  currentTheme = theme;
}

export function listThemes(): string[] {
  return Object.keys(builtInThemes);
}

export function createCustomTheme(
  name: string,
  overrides: Partial<ThemeColors>,
  base: ThemeMode = 'dark',
): Theme {
  const baseTheme = builtInThemes[base] ?? darkTheme;
  return {
    name,
    mode: base,
    colors: { ...baseTheme.colors, ...overrides },
  };
}

export { darkTheme, lightTheme };
