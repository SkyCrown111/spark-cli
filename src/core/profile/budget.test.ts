import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeProfileJson } from './analyze.js';
import { checkFrameBudget } from './budget.js';

describe('profile budget', () => {
  it('analyzes fixture and checks 60fps budget', () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'fixtures/profiles/sample.json'), 'utf8'),
    );
    const analysis = analyzeProfileJson(raw);
    const report = checkFrameBudget(analysis, 60);
    expect(analysis.summary.frameCount).toBe(2);
    expect(report.budgetMs).toBeCloseTo(16.67, 1);
  });
});
