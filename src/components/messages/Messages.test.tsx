/**
 * Messages component tests
 *
 * After Phase 16-H: Messages supports progress display messages
 * and ScrollBox-controlled visibleRange. Tests updated accordingly.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Messages } from './Messages.js';
import type { ChatMessage } from '../../core/providers/openai-compatible.js';
import type { DisplayMessage } from './DisplayMessage.js';

// Mock ink-markdown to avoid ESM top-level await issues in tests
vi.mock('ink-markdown', () => ({
  default: ({ children }: { children: string }) => children,
}));

describe('Messages component', () => {
  it('renders empty message list', () => {
    const { lastFrame } = render(<Messages messages={[]} />);
    expect(lastFrame()).toBe('');
  });

  it('renders user message', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello, assistant!' }];

    const { lastFrame } = render(<Messages messages={messages} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Hello, assistant!');
  });

  it('renders assistant message', () => {
    const messages: ChatMessage[] = [{ role: 'assistant', content: 'Hello, user!' }];

    const { lastFrame } = render(<Messages messages={messages} />);
    const output = lastFrame();

    expect(output).toContain('Hello, user!');
  });

  it('renders tool message', () => {
    const messages: ChatMessage[] = [
      { role: 'tool', content: 'Tool result data', tool_call_id: 'call_123' },
    ];

    const { lastFrame } = render(<Messages messages={messages} />);
    const output = lastFrame();

    expect(output).toContain('Tool');
    expect(output).toContain('Tool result data');
  });

  it('does not render system messages', () => {
    const messages: ChatMessage[] = [{ role: 'system', content: 'System prompt' }];

    const { lastFrame } = render(<Messages messages={messages} />);
    expect(lastFrame()).toBe('');
  });

  it('renders multiple messages in order', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Second message' },
      { role: 'user', content: 'Third message' },
    ];

    const { lastFrame } = render(<Messages messages={messages} />);
    const output = lastFrame();

    expect(output).toContain('First message');
    expect(output).toContain('Second message');
    expect(output).toContain('Third message');
  });

  it('renders with maxHeight constraint', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Message 2' },
    ];

    const { lastFrame } = render(<Messages messages={messages} maxHeight={10} />);
    const output = lastFrame();

    expect(output).toContain('Message 1');
    expect(output).toContain('Message 2');
  });

  it('handles mixed message types', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'User input' },
      { role: 'assistant', content: 'AI response', tool_calls: [] },
      { role: 'tool', content: 'Tool output', tool_call_id: 'call_456' },
      { role: 'system', content: 'System message' },
    ];

    const { lastFrame } = render(<Messages messages={messages} />);
    const output = lastFrame();

    expect(output).toContain('User input');
    expect(output).toContain('AI response');
    expect(output).toContain('Tool output');
    expect(output).not.toContain('System message');
  });

  it('renders progress display messages', () => {
    const messages: DisplayMessage[] = [
      { role: 'progress', label: 'Building project', percent: 50 },
    ];

    const { lastFrame } = render(<Messages messages={messages} />);
    const output = lastFrame();

    expect(output).toContain('Building project');
    expect(output).toContain('50%');
  });

  it('renders with visibleRange from ScrollBox', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Message 0' },
      { role: 'assistant', content: 'Message 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Message 3' },
    ];

    const { lastFrame } = render(<Messages messages={messages} visibleRange={[1, 3]} />);
    const output = lastFrame();

    // Should only render messages at index 1 and 2
    expect(output).toContain('Message 1');
    expect(output).toContain('Message 2');
    expect(output).not.toContain('Message 0');
    expect(output).not.toContain('Message 3');
  });
});
