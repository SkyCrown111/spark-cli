import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { PromptInput } from './PromptInput.js';

describe('PromptInput component', () => {
  it('renders with default props', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} />);
    const output = lastFrame();
    expect(output).toContain('>');
    expect(output).toContain('Chat');
    expect(output).toContain('Type your message...');
  });

  it('renders with custom placeholder', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput onSubmit={onSubmit} placeholder="Enter command..." />,
    );
    expect(lastFrame()).toContain('Enter command...');
  });

  it('renders different mode labels', () => {
    const onSubmit = vi.fn();
    expect(render(<PromptInput onSubmit={onSubmit} mode="chat" />).lastFrame()).toContain('Chat');
    expect(render(<PromptInput onSubmit={onSubmit} mode="direct" />).lastFrame()).toContain(
      'Direct',
    );
    expect(render(<PromptInput onSubmit={onSubmit} mode="plan" />).lastFrame()).toContain('Plan');
  });

  it('renders disabled state', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} disabled={true} />);
    expect(lastFrame()).toContain('Waiting for response...');
  });

  it('shows cursor indicator', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} />);
    expect(lastFrame()).toContain('|');
  });

  it('renders with history', () => {
    const onSubmit = vi.fn();
    const history = ['previous command 1', 'previous command 2'];
    const { lastFrame } = render(<PromptInput onSubmit={onSubmit} history={history} />);
    expect(lastFrame()).toContain('>');
  });

  it('accepts callbacks', () => {
    const onSubmit = vi.fn();
    const onModeChange = vi.fn();
    const onHistoryNavigate = vi.fn();
    render(
      <PromptInput
        onSubmit={onSubmit}
        onModeChange={onModeChange}
        onHistoryNavigate={onHistoryNavigate}
      />,
    );
    expect(onSubmit).toBeDefined();
    expect(onModeChange).not.toHaveBeenCalled();
    expect(onHistoryNavigate).not.toHaveBeenCalled();
  });

  it('renders custom props together', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(
      <PromptInput
        onSubmit={onSubmit}
        placeholder="Custom placeholder"
        mode="direct"
        multiline={true}
        maxLines={5}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('Direct');
    expect(output).toContain('Custom placeholder');
    expect(output).toContain('|');
  });
});
