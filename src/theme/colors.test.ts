/**
 * Colors theme tests
 */

import { describe, it, expect } from 'vitest';
import { colors } from './colors.js';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const CHALK_COLOR_NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'gray',
  'grey',
] as const;

describe('colors theme', () => {
  it('exports colors object', () => {
    expect(colors).toBeDefined();
    expect(typeof colors).toBe('object');
  });

  it('has primary colors', () => {
    expect(colors.primary).toMatch(HEX_COLOR);
    expect(colors.secondary).toMatch(HEX_COLOR);
  });

  it('has status colors', () => {
    expect(colors.success).toMatch(HEX_COLOR);
    expect(colors.warning).toMatch(HEX_COLOR);
    expect(colors.error).toMatch(HEX_COLOR);
    expect(colors.info).toMatch(HEX_COLOR);
  });

  it('has UI colors', () => {
    expect(colors.muted).toMatch(HEX_COLOR);
    expect(colors.text).toBe('white');
    expect(colors.background).toBe('black');
  });

  it('has role-specific colors', () => {
    expect(colors.user).toMatch(HEX_COLOR);
    expect(colors.assistant).toMatch(HEX_COLOR);
    expect(colors.tool).toMatch(HEX_COLOR);
    expect(colors.system).toMatch(HEX_COLOR);
  });

  it('all color values are strings', () => {
    Object.values(colors).forEach((color) => {
      expect(typeof color).toBe('string');
    });
  });

  it('has expected number of colors', () => {
    const colorKeys = Object.keys(colors);
    expect(colorKeys.length).toBeGreaterThanOrEqual(11);
  });

  it('color values are hex or chalk names', () => {
    Object.values(colors).forEach((color) => {
      const isHex = HEX_COLOR.test(color);
      const isChalk = (CHALK_COLOR_NAMES as readonly string[]).includes(color);
      expect(isHex || isChalk).toBe(true);
    });
  });
});
