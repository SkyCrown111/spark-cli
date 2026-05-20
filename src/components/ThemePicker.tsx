/**
 * ThemePicker — interactive theme selection overlay.
 *
 * Displays available themes with preview of color scheme,
 * j/k navigation and Enter to select. Launched via
 * keybinding or /theme slash command.
 */

import React, { useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { CustomSelect, type SelectOption } from './CustomSelect/index.js';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import {
  listThemes,
  getTheme,
  setTheme,
  type Theme,
  darkTheme,
  lightTheme,
} from '../theme/theme.js';

// ── Props ──────────────────────────────────────────────

export interface ThemePickerProps {
  /** Callback when user selects and applies a theme */
  onSelect: (themeName: string) => void;
  /** Callback when user cancels */
  onCancel: () => void;
}

// ── Preview block ──────────────────────────────────────

const ThemePreview: React.FC<{ theme: Theme }> = ({ theme }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text dimColor>Preview:</Text>
    <Box flexDirection="row" gap={1}>
      <Text color={theme.colors.user}>User</Text>
      <Text color={theme.colors.assistant}>Assistant</Text>
      <Text color={theme.colors.tool}>Tool</Text>
      <Text color={theme.colors.system}>System</Text>
      <Text color={theme.colors.error}>Error</Text>
      <Text color={theme.colors.primary}>Primary</Text>
      <Text color={theme.colors.muted}>Muted</Text>
    </Box>
  </Box>
);

// ── Component ──────────────────────────────────────────

export const ThemePicker: React.FC<ThemePickerProps> = ({
  onSelect,
  onCancel,
}) => {
  // Register ThemePicker context for keybinding resolution
  useRegisterKeybindingContext('ThemePicker');

  const currentThemeName = getTheme().name;

  const options = useMemo<SelectOption[]>(() => {
    const themeNames = listThemes();
    return themeNames.map((name) => ({
      value: name,
      label: name === 'dark' ? 'Dark (default)' : name === 'light' ? 'Light' : name,
      selected: name === currentThemeName,
      description: name === 'dark'
        ? 'Dark background with cyan accents'
        : name === 'light'
          ? 'Light background with blue accents'
          : undefined,
    }));
  }, [currentThemeName]);

  const handleSelect = useCallback((themeName: string) => {
    setTheme(themeName);
    onSelect(themeName);
  }, [onSelect]);

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box paddingBottom={1}>
        <Text bold color="cyan">Select Theme</Text>
        <Text dimColor> — current: {currentThemeName}</Text>
      </Box>

      <CustomSelect
        options={options}
        initialFocus={currentThemeName}
        onSelect={handleSelect}
        onCancel={onCancel}
        header="Available Themes"
        maxVisible={5}
      />

      <ThemePreview theme={currentThemeName === 'light' ? lightTheme : darkTheme} />
    </Box>
  );
};