import { describe, it, expect } from 'vitest';
import {
  formatModeLine,
  formatInputFooterLine,
  formatReplPrompt,
  formatTokenCompact,
} from './repl-ui.js';
import { stripAnsi } from './terminal.js';
import { freshStateForTest } from '../../commands/shell.js';
import { createPlanState, enterPlan } from '../slash/plan-mode.js';

describe('repl-ui', () => {
  it('formats prompt with Claude-style placeholder', () => {
    const withPh = stripAnsi(formatReplPrompt(freshStateForTest(), true));
    expect(withPh).toContain('> ');
    expect(withPh).toContain('Try "create a util logging.py');

    const bare = stripAnsi(formatReplPrompt(freshStateForTest(), false));
    expect(bare).toBe('> ');
  });

  it('formatModeLine matches Claude shift+tab modes', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 120 });

    const normal = stripAnsi(formatModeLine(freshStateForTest()));
    expect(normal).toContain('? for shortcuts');

    const auto = stripAnsi(formatModeLine(freshStateForTest({ writeMode: 'direct' })));
    expect(auto).toContain('accept edits on');
    expect(auto).toContain('shift+tab to cycle');

    const plan = stripAnsi(
      formatModeLine(freshStateForTest({ plan: enterPlan(createPlanState()) })),
    );
    expect(plan).toContain('plan mode on');
    expect(plan).toContain('auto mode is unavailable');

    if (original !== undefined) {
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: original });
    }
  });

  it('shows token usage as a progress bar without model text', () => {
    const line = stripAnsi(
      formatModeLine(freshStateForTest({ tokenUsage: { used: 8000, budget: 32000 } })),
    );
    expect(line).toContain('ctx [');
    expect(line).toContain('8.0k/32k');
    expect(line).toContain('25%');
    expect(line).not.toContain('model:');
    // 25% of 14 → ~4 filled blocks, rest spaces (not a full row of dashes).
    expect(line).toMatch(/ctx \[[#█]{3,5} +\] /);
  });

  it('formatTokenCompact uses M for million-token budgets', () => {
    expect(formatTokenCompact(1_000_000)).toBe('1M');
    expect(formatTokenCompact(8000)).toBe('8.0k');
  });

  it('renders an empty bar at 0% (spaces inside brackets, not filled dashes)', () => {
    const line = stripAnsi(
      formatModeLine(freshStateForTest({ tokenUsage: { used: 0, budget: 32000 } })),
    );
    expect(line).toMatch(/ctx \[ {14}\] 0\/32k 0%/);
    expect(line).not.toMatch(/ctx \[-{10,}/);
  });

  it('keeps ctx usage right-aligned when the terminal is narrow', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 52,
    });

    const line = stripAnsi(
      formatModeLine(freshStateForTest({ tokenUsage: { used: 8000, budget: 32000 } })),
    );

    if (original !== undefined) {
      Object.defineProperty(process.stdout, 'columns', {
        configurable: true,
        value: original,
      });
    }

    expect(line).toContain('ctx [');
    expect(line.trimEnd()).toMatch(/ctx \[.*\] 8\.0k\/32k 25%$/);
  });

  it('can swap the footer hint for ctrl-c exit confirmation', () => {
    expect(stripAnsi(formatInputFooterLine())).toContain('esc to interrupt');
    expect(stripAnsi(formatInputFooterLine('Ctrl-C again to exit'))).toContain(
      'Ctrl-C again to exit',
    );
  });
});
