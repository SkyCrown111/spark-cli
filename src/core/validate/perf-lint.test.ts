import { describe, it, expect } from 'vitest';
import { lintPerfInFile } from './perf-lint.js';

describe('perf-lint', () => {
  it('flags allocation inside update()', () => {
    const src = `
      update(dt: number) {
        const x = new Array(10);
      }
    `;
    const f = lintPerfInFile('assets/scripts/Bad.ts', src);
    expect(f.some((x) => x.id === 'tick-allocation')).toBe(true);
  });

  it('flags setInterval without clear', () => {
    const src = `setInterval(() => {}, 1000);`;
    const f = lintPerfInFile('a.ts', src);
    expect(f.some((x) => x.id === 'interval-leak')).toBe(true);
  });
});
