/**
 * REPL screen tests
 *
 * After 16-A: REPL reads state from AppState (Zustand).
 * Tests must set up the store before rendering.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock hooks that depend on Ink context
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useApp: () => ({ exit: vi.fn() }),
    useStdout: () => ({
      stdout: { columns: 80, rows: 24, on: vi.fn(), off: vi.fn() },
    }),
  };
});

import { REPL } from './REPL.js';
import { appState } from '../state/AppState.js';
import { KeybindingProviderSetup } from '../keybindings/KeybindingProviderSetup.js';

/**
 * Helper to render REPL wrapped in KeybindingProviderSetup.
 * The new context-based keybinding system requires the provider.
 */
function renderREPL(onSubmit: ReturnType<typeof vi.fn>) {
  return render(
    <KeybindingProviderSetup>
      <REPL onSubmit={onSubmit} />
    </KeybindingProviderSetup>,
  );
}

describe('REPL screen', () => {
  beforeEach(() => {
    appState.setState({
      messages: [],
      mode: 'chat',
      loading: false,
      model: 'test-model',
      tokenUsage: undefined,
      statusText: undefined,
    });
  });

  it('renders with default state from AppState', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    const output = lastFrame();
    expect(output).toContain('test-model');
    expect(output).toContain('[chat]');
  });

  it('renders with direct mode', () => {
    appState.setState({ mode: 'direct' });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('[direct]');
  });

  it('renders plan mode placeholder', () => {
    appState.setState({ mode: 'plan' });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('[plan]');
  });

  it('shows model name from AppState in status bar', () => {
    appState.setState({ model: 'openai/gpt-4o' });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('openai/gpt-4o');
  });

  it('shows token usage from AppState', () => {
    appState.setState({ tokenUsage: { used: 1500, budget: 200000 } });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('1.5K');
  });

  it('renders loading spinner when AppState loading is true', () => {
    appState.setState({ loading: true });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('Thinking...');
  });

  it('renders status message from AppState', () => {
    appState.setState({ statusText: 'Processing...' });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('Processing...');
  });

  it('renders disabled input when loading', () => {
    appState.setState({ loading: true });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('(disabled)');
  });

  it('renders input area with cursor', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    expect(lastFrame()).toContain('█');
  });

  it('renders token percentage when tokenUsage is set', () => {
    appState.setState({ tokenUsage: { used: 50000, budget: 200000 } });
    const onSubmit = vi.fn();
    const { lastFrame } = renderREPL(onSubmit);

    // 50000 / 200000 = 25.0%
    expect(lastFrame()).toContain('25.0%');
  });
});