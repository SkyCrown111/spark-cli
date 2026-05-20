/**
 * Colors theme tests
 */

import { describe, it, expect } from 'vitest';
import { colors } from './colors.js';

describe('colors theme', () => {
  it('exports colors object', () => {
    expect(colors).toBeDefined();
    expect(typeof colors).toBe('object');
  });

  it('has primary colors', () => {
    expect(colors.primary).toBe('cyan');
    expect(colors.secondary).toBe('blue');
  });

  it('has status colors', () => {
    expect(colors.success).toBe('green');
    expect(colors.warning).toBe('yellow');
    expect(colors.error).toBe('red');
    expect(colors.info).toBe('blue');
  });

  it('has UI colors', () => {
    expect(colors.muted).toBe('gray');
    expect(colors.text).toBe('white');
    expect(colors.background).toBe('black');
  });

  it('has role-specific colors', () => {
    expect(colors.user).toBe('cyan');
    expect(colors.assistant).toBe('green');
    expect(colors.tool).toBe('magenta');
    expect(colors.system).toBe('yellow');
  });

  it('all color values are strings', () => {
    Object.values(colors).forEach(color => {
      expect(typeof color).toBe('string');
    });
  });

  it('has expected number of colors', () => {
    const colorKeys = Object.keys(colors);
    expect(colorKeys.length).toBeGreaterThanOrEqual(11);
  });

  it('color names are valid', () => {
    const validColors = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey'
    ];
    
    Object.values(colors).forEach(color => {
      expect(validColors).toContain(color);
    });
  });
});
