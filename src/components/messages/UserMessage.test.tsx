/**
 * UserMessage component tests
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { UserMessage } from './UserMessage.js';
import type { UserMessage as UserMessageType } from '../../core/providers/openai-compatible.js';

describe('UserMessage component', () => {
  it('renders simple text message', () => {
    const message: UserMessageType = {
      role: 'user',
      content: 'Hello, world!',
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Hello, world!');
  });

  it('renders multiline text message', () => {
    const message: UserMessageType = {
      role: 'user',
      content: 'Line 1\nLine 2\nLine 3',
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).toContain('Line 3');
  });

  it('renders message with content parts (text)', () => {
    const message: UserMessageType = {
      role: 'user',
      content: [{ type: 'text', text: 'Text content' }],
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Text content');
  });

  it('renders message with image placeholder', () => {
    const message: UserMessageType = {
      role: 'user',
      content: [
        { type: 'text', text: 'Check this image:' },
        { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
      ],
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Check this image:');
    expect(output).toContain('[Image]');
  });

  it('renders empty message', () => {
    const message: UserMessageType = {
      role: 'user',
      content: '',
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
  });

  it('handles multiple text parts', () => {
    const message: UserMessageType = {
      role: 'user',
      content: [
        { type: 'text', text: 'Part 1' },
        { type: 'text', text: 'Part 2' },
        { type: 'text', text: 'Part 3' },
      ],
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Part 1');
    expect(output).toContain('Part 2');
    expect(output).toContain('Part 3');
  });

  it('filters out empty content parts', () => {
    const message: UserMessageType = {
      role: 'user',
      content: [{ type: 'text', text: 'Valid text' }, { type: 'unknown' } as any],
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('>');
    expect(output).toContain('Valid text');
  });
});
