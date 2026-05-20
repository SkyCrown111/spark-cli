/**
 * useKeybindings hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the useInput callback
let capturedInputHandler: ((input: string, key: any) => void) | undefined;

vi.mock('ink', () => ({
  useInput: (handler: (input: string, key: any) => void) => {
    capturedInputHandler = handler;
  },
}));

import React from 'react';
import { render } from 'ink-testing-library';
import { useKeybindings, commonKeybindings } from './useKeybindings.js';
import type { KeyBinding } from './useKeybindings.js';

function TestComponent({ bindings, enabled }: { bindings: KeyBinding[]; enabled?: boolean }) {
  useKeybindings({ bindings, enabled });
  return null!;
}

describe('useKeybindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedInputHandler = undefined;
  });

  it('registers input handler on mount', () => {
    render(<TestComponent bindings={[]} />);
    expect(capturedInputHandler).toBeDefined();
  });

  it('calls handler when key matches binding', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'c', ctrl: true, handler, description: 'Interrupt' },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('c', { ctrl: true, shift: false, meta: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when modifiers do not match', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'c', ctrl: true, handler },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('c', { ctrl: false, shift: false, meta: false });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handler when key does not match', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'c', ctrl: true, handler },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('d', { ctrl: true, shift: false, meta: false });
    expect(handler).not.toHaveBeenCalled();
  });

  it('matches shift modifier', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'tab', shift: true, handler },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('tab', { ctrl: false, shift: true, meta: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('matches meta/alt modifier', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'h', meta: true, handler },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('h', { ctrl: false, shift: false, meta: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('calls only first matching binding', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'c', ctrl: true, handler: handler1 },
      { key: 'c', ctrl: true, handler: handler2 },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('c', { ctrl: true, shift: false, meta: false });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });

  it('ignores input when enabled is false', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'c', ctrl: true, handler },
    ];

    render(<TestComponent bindings={bindings} enabled={false} />);

    capturedInputHandler!('c', { ctrl: true, shift: false, meta: false });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles multiple bindings', () => {
    const ctrlCHandler = vi.fn();
    const ctrlDHandler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'c', ctrl: true, handler: ctrlCHandler },
      { key: 'd', ctrl: true, handler: ctrlDHandler },
    ];

    render(<TestComponent bindings={bindings} />);

    capturedInputHandler!('d', { ctrl: true, shift: false, meta: false });
    expect(ctrlCHandler).not.toHaveBeenCalled();
    expect(ctrlDHandler).toHaveBeenCalledTimes(1);
  });

  it('ignores modifier fields not specified in binding', () => {
    const handler = vi.fn();
    const bindings: KeyBinding[] = [
      { key: 'x', handler }, // no ctrl/shift/meta specified
    ];

    render(<TestComponent bindings={bindings} />);

    // Should match regardless of modifier state since none are specified
    capturedInputHandler!('x', { ctrl: true, shift: false, meta: false });
    expect(handler).toHaveBeenCalledTimes(1);

    capturedInputHandler!('x', { ctrl: false, shift: true, meta: false });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('commonKeybindings presets', () => {
  it('creates interrupt binding (Ctrl+C)', () => {
    const handler = vi.fn();
    const binding = commonKeybindings.interrupt(handler);

    expect(binding.key).toBe('c');
    expect(binding.ctrl).toBe(true);
    expect(binding.handler).toBe(handler);
    expect(binding.description).toBeDefined();
  });

  it('creates exit binding (Ctrl+D)', () => {
    const handler = vi.fn();
    const binding = commonKeybindings.exit(handler);

    expect(binding.key).toBe('d');
    expect(binding.ctrl).toBe(true);
    expect(binding.handler).toBe(handler);
  });

  it('creates clear binding (Ctrl+L)', () => {
    const handler = vi.fn();
    const binding = commonKeybindings.clear(handler);

    expect(binding.key).toBe('l');
    expect(binding.ctrl).toBe(true);
    expect(binding.handler).toBe(handler);
  });

  it('creates autocomplete binding (Tab)', () => {
    const handler = vi.fn();
    const binding = commonKeybindings.autocomplete(handler);

    expect(binding.key).toBe('tab');
    expect(binding.ctrl).toBeUndefined();
    expect(binding.handler).toBe(handler);
  });

  it('creates cycleMode binding (Shift+Tab)', () => {
    const handler = vi.fn();
    const binding = commonKeybindings.cycleMode(handler);

    expect(binding.key).toBe('tab');
    expect(binding.shift).toBe(true);
    expect(binding.handler).toBe(handler);
  });
});
