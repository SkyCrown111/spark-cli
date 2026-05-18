import { describe, it, expect } from 'vitest';
import { terminalWidth } from './terminal.js';

describe('terminalWidth', () => {
  it('keeps the real terminal width instead of capping wide windows', () => {
    expect(terminalWidth(80)).toBe(80);
    expect(terminalWidth(120)).toBe(120);
    expect(terminalWidth(180)).toBe(180);
  });

  it('still enforces a small minimum width', () => {
    expect(terminalWidth(20)).toBe(52);
  });
});
