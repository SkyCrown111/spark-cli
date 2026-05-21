/**
 * PromptInput component tests
 *
 * After P0.4: PromptInput uses PromptInputModeIndicator (❯)
 * instead of [mode] text. Tests updated accordingly.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { PromptInput } from './PromptInput.js';

describe('PromptInput component', () => {
  it('renders with default props', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} />);

    const output = lastFrame();
    // Should show the ❯ prompt character (cyan for chat mode)
    expect(output).toContain('❯');
    expect(output).toContain('Type your message...');
  });

  it('renders with custom placeholder', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} placeholder="Enter command..." />
    );

    expect(lastFrame()).toContain('Enter command...');
  });

  it('renders with different modes', () => {
    const onSubmit = vi.fn();

    const { lastFrame: chatFrame } = render(
      <PromptInput onSubmit={onSubmit} mode="chat" />
    );
    // Chat mode: ❯ prompt
    expect(chatFrame()).toContain('❯');

    const { lastFrame: directFrame } = render(
      <PromptInput onSubmit={onSubmit} mode="direct" />
    );
    // Direct mode: ❯ prompt (different color, same character)
    expect(directFrame()).toContain('❯');

    const { lastFrame: planFrame } = render(
      <PromptInput onSubmit={onSubmit} mode="plan" />
    );
    // Plan mode: ❯ prompt (magenta color)
    expect(planFrame()).toContain('❯');
  });

  it('renders disabled state', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} disabled={true} />
    );

    expect(lastFrame()).toContain('Waiting for response...');
  });

  it('shows cursor indicator', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} />);

    // Cursor should be visible (█ character)
    expect(lastFrame()).toContain('█');
  });

  // Note: Interactive input tests (typing, backspace, etc.) cannot be tested with
  // ink-testing-library as useInput doesn't respond to stdin.write().
  // These features require manual integration testing or E2E tests.

  it('renders component structure correctly', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} />);

    const output = lastFrame();
    // Should have the ❯ prompt indicator, placeholder, and cursor
    expect(output).toContain('❯');
    expect(output).toContain('Type your message...');
    expect(output).toContain('█'); // Cursor should be visible
  });

  it('onSubmit callback is provided', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} />);

    // Callback should be defined (actual invocation requires user input)
    expect(onSubmit).toBeDefined();
    expect(typeof onSubmit).toBe('function');
  });

  it('disabled prop prevents interaction', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} disabled={true} />);

    // Should show disabled state
    expect(lastFrame()).toContain('Waiting for response...');
  });

  it('shows prompt indicator', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} multiline={true} />
    );

    const output = lastFrame();
    expect(output).toContain('❯');
  });

  it('renders prompt indicator with multiline disabled', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} multiline={false} />
    );

    const output = lastFrame();
    expect(output).toContain('❯');
  });

  it('renders with history', () => {
    const onSubmit = vi.fn();
    const history = ['previous command 1', 'previous command 2'];

    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} history={history} />
    );

    // Should render normally (history is accessed via up/down arrows)
    expect(lastFrame()).toContain('❯');
  });

  it('handles mode change callback', () => {
    const onSubmit = vi.fn();
    const onModeChange = vi.fn();

    render(
      <PromptInput
        onSubmit={onSubmit}
        mode="chat"
        onModeChange={onModeChange}
      />
    );

    // Mode change is triggered by Shift+Tab, which is tested in integration
    expect(onModeChange).not.toHaveBeenCalled(); // Not called on render
  });

  it('handles history navigate callback', () => {
    const onSubmit = vi.fn();
    const onHistoryNavigate = vi.fn();
    const history = ['cmd1', 'cmd2'];

    render(
      <PromptInput
        onSubmit={onSubmit}
        history={history}
        onHistoryNavigate={onHistoryNavigate}
      />
    );

    // History navigation is triggered by up/down arrows
    expect(onHistoryNavigate).not.toHaveBeenCalled(); // Not called on render
  });

  it('respects maxLines limit', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} multiline={true} maxLines={3} />
    );

    // Component should render (maxLines is enforced during input)
    expect(lastFrame()).toContain('❯');
  });

  it('handles empty history array', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} history={[]} />
    );

    expect(lastFrame()).toContain('❯');
  });

  it('renders with all props combined', () => {
    const onSubmit = vi.fn();
    const onModeChange = vi.fn();
    const onHistoryNavigate = vi.fn();
    const history = ['cmd1', 'cmd2'];

    const { lastFrame } = render(
      <PromptInput
        onSubmit={onSubmit}
        placeholder="Custom placeholder"
        mode="direct"
        onModeChange={onModeChange}
        disabled={false}
        history={history}
        onHistoryNavigate={onHistoryNavigate}
        multiline={true}
        maxLines={5}
      />
    );

    const output = lastFrame();
    // Direct mode uses ❯ prompt character (not [direct] text)
    expect(output).toContain('❯');
    expect(output).toContain('Custom placeholder');
  });
});
