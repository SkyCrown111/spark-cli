/**
 * Box component tests
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Box } from './Box.js';
import { Text } from './Text.js';

describe('Box component', () => {
  it('renders children correctly', () => {
    const { lastFrame } = render(
      <Box>
        <Text>Hello World</Text>
      </Box>
    );
    
    expect(lastFrame()).toContain('Hello World');
  });

  it('renders with flexDirection column', () => {
    const { lastFrame } = render(
      <Box flexDirection="column">
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Box>
    );
    
    const output = lastFrame();
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
  });

  it('renders with padding', () => {
    const { lastFrame } = render(
      <Box padding={2}>
        <Text>Padded</Text>
      </Box>
    );
    
    expect(lastFrame()).toContain('Padded');
  });

  it('renders with border', () => {
    const { lastFrame } = render(
      <Box borderStyle="single">
        <Text>Bordered</Text>
      </Box>
    );
    
    const output = lastFrame()!;
    expect(output).toContain('Bordered');
    // Border characters should be present
    expect(output.length).toBeGreaterThan('Bordered'.length);
  });

  it('renders empty box', () => {
    const { lastFrame } = render(<Box />);
    expect(lastFrame()).toBe('');
  });

  it('renders with multiple children', () => {
    const { lastFrame } = render(
      <Box>
        <Text>First</Text>
        <Text>Second</Text>
        <Text>Third</Text>
      </Box>
    );
    
    const output = lastFrame();
    expect(output).toContain('First');
    expect(output).toContain('Second');
    expect(output).toContain('Third');
  });

  it('renders with nested boxes', () => {
    const { lastFrame } = render(
      <Box>
        <Box>
          <Text>Nested</Text>
        </Box>
      </Box>
    );
    
    expect(lastFrame()).toContain('Nested');
  });
});
