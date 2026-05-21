/**
 * AssistantMessage component tests
 *
 * After Phase 16-H: AssistantMessage supports thinking blocks
 * and tool call grouping. Tests updated for new rendering.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { AssistantMessage } from './AssistantMessage.js';
import type { AssistantMessage as AssistantMessageType } from '../../core/providers/openai-compatible.js';

// Mock ink-markdown to avoid ESM top-level await issues in tests
vi.mock('ink-markdown', () => ({
  default: ({ children }: { children: string }) => <>{children}</>
}));

describe('AssistantMessage component', () => {
  it('renders simple text message', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: 'Hello, user!'
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Hello, user!');
  });

  it('renders markdown formatted message', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: '**Bold text** and *italic text*'
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    // Markdown rendering will transform the text
    expect(output).toContain('Bold text');
    expect(output).toContain('italic text');
  });

  it('renders message with tool calls indicator', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: 'Let me check that for you.',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'search', arguments: '{}' }
        }
      ]
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Let me check that for you.');
    expect(output).toContain('search');
  });

  it('renders message with multiple tool calls', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: 'Processing...',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'tool1', arguments: '{}' }
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'tool2', arguments: '{}' }
        }
      ]
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('tool1');
    expect(output).toContain('tool2');
  });

  it('renders empty content with tool calls', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'search', arguments: '{}' }
        }
      ]
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('search');
  });

  it('renders message with content parts', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Here is the answer.' }
      ]
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Here is the answer.');
  });

  it('handles empty message', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: ''
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    // Empty content should render without errors
    expect(lastFrame()).toBeDefined();
  });

  it('handles whitespace-only content', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: '   \n\n   '
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    // Whitespace-only content should not render visible text
    expect(output).not.toContain('Assistant');
  });

  it('renders multiline markdown', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: '# Heading\n\nParagraph text\n\n- Item 1\n- Item 2'
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Heading');
    expect(output).toContain('Paragraph text');
  });

  it('renders thinking content from content parts', () => {
    const message: AssistantMessageType = {
      role: 'assistant',
      content: [
        { type: 'thinking', text: 'Let me reason about this...' },
        { type: 'text', text: 'Here is my answer.' }
      ]
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Thinking');
    expect(output).toContain('Here is my answer.');
  });
});
