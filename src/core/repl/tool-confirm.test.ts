import { describe, it, expect } from 'vitest';
import { renderConfirmCard, resolveToolConfirmKey } from './tool-confirm.js';
import { stripAnsi } from './terminal.js';

describe('tool-confirm', () => {
  it('renders numbered options', () => {
    const lines = renderConfirmCard({ tool: 'write_file', argsSummary: 'client/tools/x.sh' }, 0);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).toContain('允许本次');
  });

  it('supports arrow keys and digit keys', () => {
    let sel = 0;
    const down = resolveToolConfirmKey(sel, undefined, { name: 'down' });
    expect(down.selected).toBe(1);
    sel = down.selected;

    const pick = resolveToolConfirmKey(sel, '3', {});
    expect(pick.answer).toBe('allow-always');

    const deny = resolveToolConfirmKey(0, '2', {});
    expect(deny.answer).toBe('deny');
  });
});
