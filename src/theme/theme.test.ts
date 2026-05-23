/**
 * Theme system tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTheme,
  setTheme,
  setCustomTheme,
  listThemes,
  createCustomTheme,
  darkTheme,
  lightTheme,
} from './theme.js';

describe('Theme system', () => {
  beforeEach(() => {
    // Reset to dark theme before each test
    setTheme('dark');
  });

  it('defaults to dark theme', () => {
    const theme = getTheme();
    expect(theme.name).toBe('dark');
    expect(theme.mode).toBe('dark');
    expect(theme.colors.primary).toBe('cyan');
  });

  it('switches to light theme', () => {
    setTheme('light');
    const theme = getTheme();
    expect(theme.name).toBe('light');
    expect(theme.mode).toBe('light');
    expect(theme.colors.primary).toBe('blue');
  });

  it('returns false for unknown theme', () => {
    expect(setTheme('nonexistent')).toBe(false);
    // Should still be dark
    expect(getTheme().name).toBe('dark');
  });

  it('lists available themes', () => {
    const names = listThemes();
    expect(names).toContain('dark');
    expect(names).toContain('light');
  });

  it('creates custom theme with overrides', () => {
    const custom = createCustomTheme('custom', { primary: 'magenta' }, 'dark');
    expect(custom.name).toBe('custom');
    expect(custom.mode).toBe('dark');
    expect(custom.colors.primary).toBe('magenta');
    // Inherited from dark theme
    expect(custom.colors.secondary).toBe(darkTheme.colors.secondary);
  });

  it('applies custom theme', () => {
    const custom = createCustomTheme('my-theme', {
      primary: 'green',
      text: 'yellow',
    });
    setCustomTheme(custom);

    const current = getTheme();
    expect(current.name).toBe('my-theme');
    expect(current.colors.primary).toBe('green');
    expect(current.colors.text).toBe('yellow');
  });

  it('custom theme inherits from light base', () => {
    const custom = createCustomTheme('light-variant', {}, 'light');
    expect(custom.mode).toBe('light');
    expect(custom.colors.primary).toBe(lightTheme.colors.primary);
  });

  it('dark theme has correct color values', () => {
    expect(darkTheme.colors.error).toBe('red');
    expect(darkTheme.colors.success).toBe('green');
    expect(darkTheme.colors.warning).toBe('yellow');
    expect(darkTheme.colors.user).toBe('cyan');
    expect(darkTheme.colors.assistant).toBe('green');
    expect(darkTheme.colors.tool).toBe('magenta');
  });

  it('light theme has correct color values', () => {
    expect(lightTheme.colors.error).toBe('red');
    expect(lightTheme.colors.success).toBe('green');
    expect(lightTheme.colors.text).toBe('black');
    expect(lightTheme.colors.background).toBe('white');
  });
});
