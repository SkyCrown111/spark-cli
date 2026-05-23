/**
 * Text component tests
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Text } from './Text.js';

describe('Text component', () => {
  it('renders text content', () => {
    const { lastFrame } = render(<Text>Hello World</Text>);
    expect(lastFrame()).toBe('Hello World');
  });

  it('renders with color', () => {
    const { lastFrame } = render(<Text color="cyan">Colored Text</Text>);
    // The text should be present (color is applied via ANSI codes)
    expect(lastFrame()).toContain('Colored Text');
  });

  it('renders bold text', () => {
    const { lastFrame } = render(<Text bold>Bold Text</Text>);
    expect(lastFrame()).toContain('Bold Text');
  });

  it('renders italic text', () => {
    const { lastFrame } = render(<Text italic>Italic Text</Text>);
    expect(lastFrame()).toContain('Italic Text');
  });

  it('renders underlined text', () => {
    const { lastFrame } = render(<Text underline>Underlined Text</Text>);
    expect(lastFrame()).toContain('Underlined Text');
  });

  it('renders dimmed text', () => {
    const { lastFrame } = render(<Text dimColor>Dimmed Text</Text>);
    expect(lastFrame()).toContain('Dimmed Text');
  });

  it('renders with multiple styles', () => {
    const { lastFrame } = render(
      <Text bold color="green">
        Styled Text
      </Text>,
    );
    expect(lastFrame()).toContain('Styled Text');
  });

  it('renders empty text', () => {
    const { lastFrame } = render(<Text />);
    expect(lastFrame()).toBe('');
  });

  it('renders numeric children', () => {
    const { lastFrame } = render(<Text>{42}</Text>);
    expect(lastFrame()).toBe('42');
  });

  it('renders with wrap truncate', () => {
    const { lastFrame } = render(
      <Text wrap="truncate">This is a very long text that should be truncated</Text>,
    );
    expect(lastFrame()).toContain('This is a very long text');
  });
});
