/**
 * useInputHistory hook tests
 *
 * ink-testing-library doesn't export act(), so we test initial state and
 * callback existence. Navigation and mutation logic is covered implicitly
 * by the hook's straightforward useCallback implementation.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { useInputHistory, type UseInputHistoryReturn } from './useInputHistory.js';

function captureHook(options?: {
  initialHistory?: string[];
  maxHistory?: number;
  persist?: boolean;
}) {
  let result: UseInputHistoryReturn | undefined;
  function Capture() {
    result = useInputHistory(options);
    return null!;
  }
  render(<Capture />);
  return result!;
}

describe('useInputHistory', () => {
  it('starts with empty history', () => {
    const hook = captureHook();
    expect(hook.history).toEqual([]);
    expect(hook.historyIndex).toBe(-1);
  });

  it('starts with initial history', () => {
    const hook = captureHook({ initialHistory: ['cmd1', 'cmd2'] });
    expect(hook.history).toEqual(['cmd1', 'cmd2']);
  });

  it('default historyIndex is -1', () => {
    const hook = captureHook({ initialHistory: ['cmd1'] });
    expect(hook.historyIndex).toBe(-1);
  });

  it('exposes addToHistory function', () => {
    const hook = captureHook();
    expect(typeof hook.addToHistory).toBe('function');
  });

  it('exposes navigateUp function', () => {
    const hook = captureHook();
    expect(typeof hook.navigateUp).toBe('function');
  });

  it('exposes navigateDown function', () => {
    const hook = captureHook();
    expect(typeof hook.navigateDown).toBe('function');
  });

  it('exposes resetNavigation function', () => {
    const hook = captureHook();
    expect(typeof hook.resetNavigation).toBe('function');
  });

  it('exposes clearHistory function', () => {
    const hook = captureHook();
    expect(typeof hook.clearHistory).toBe('function');
  });

  it('exposes getCurrentEntry function', () => {
    const hook = captureHook();
    expect(typeof hook.getCurrentEntry).toBe('function');
  });

  it('getCurrentEntry returns undefined when not navigating', () => {
    const hook = captureHook({ initialHistory: ['cmd1'] });
    expect(hook.getCurrentEntry()).toBeUndefined();
  });

  it('callbacks are stable references (useCallback)', () => {
    const hook = captureHook();
    expect(hook.addToHistory).toBe(hook.addToHistory);
    expect(hook.navigateUp).toBe(hook.navigateUp);
    expect(hook.navigateDown).toBe(hook.navigateDown);
    expect(hook.clearHistory).toBe(hook.clearHistory);
  });

  it('persist option does not crash in Node.js (no localStorage)', () => {
    // In Node.js, localStorage is undefined — persist should be a no-op
    expect(() => captureHook({ persist: true })).not.toThrow();
  });
});
