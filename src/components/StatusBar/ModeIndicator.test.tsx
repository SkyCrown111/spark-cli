/**
 * Tests for ModeIndicator component
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ModeIndicator } from './ModeIndicator.js';

describe('ModeIndicator', () => {
  it('renders chat mode correctly', () => {
    const { lastFrame } = render(<ModeIndicator mode="chat" />);
    expect(lastFrame()).toContain('Mode:');
    expect(lastFrame()).toContain('Chat');
  });

  it('renders direct mode correctly', () => {
    const { lastFrame } = render(<ModeIndicator mode="direct" />);
    expect(lastFrame()).toContain('Mode:');
    expect(lastFrame()).toContain('Direct');
  });

  it('renders plan mode correctly', () => {
    const { lastFrame } = render(<ModeIndicator mode="plan" />);
    expect(lastFrame()).toContain('Mode:');
    expect(lastFrame()).toContain('Plan');
  });

  it('hides label when showLabel is false', () => {
    const { lastFrame } = render(<ModeIndicator mode="chat" showLabel={false} />);
    expect(lastFrame()).not.toContain('Mode:');
    expect(lastFrame()).toContain('Chat');
  });

  it('shows label by default', () => {
    const { lastFrame } = render(<ModeIndicator mode="chat" />);
    expect(lastFrame()).toContain('Mode:');
  });

  it('displays all three modes with correct names', () => {
    const modes = ['chat', 'direct', 'plan'] as const;
    const expectedNames = ['Chat', 'Direct', 'Plan'];

    modes.forEach((mode, index) => {
      const { lastFrame } = render(<ModeIndicator mode={mode} />);
      expect(lastFrame()).toContain(expectedNames[index]);
    });
  });
});
