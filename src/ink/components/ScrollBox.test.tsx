/**
 * ScrollBox component tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ScrollBox } from './ScrollBox.js';

// Mock useTerminalSize
vi.mock('../../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

// Mock useInput — we test the scroll logic, not keyboard handling
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: vi.fn(),
    useApp: () => ({ exit: vi.fn() }),
  };
});

describe('ScrollBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders content through children callback (autoPin=false)', () => {
    let capturedRange: [number, number] = [0, 0];
    render(
      <ScrollBox rowCount={50} estimatedRowHeight={1} maxHeight={10} autoPinToBottom={false}>
        {(start, end) => {
          capturedRange = [start, end];
          return null;
        }}
      </ScrollBox>,
    );

    // Without autoPinToBottom, starts from 0 with buffer=2
    expect(capturedRange[0]).toBe(0);
    expect(capturedRange[1]).toBeLessThanOrEqual(50);
  });

  it('auto-pins to bottom when rowCount exceeds viewport', () => {
    let capturedRange: [number, number] = [0, 0];
    render(
      <ScrollBox rowCount={30} estimatedRowHeight={1} maxHeight={10} autoPinToBottom={true}>
        {(start, end) => {
          capturedRange = [start, end];
          return null;
        }}
      </ScrollBox>,
    );

    // With autoPinToBottom, offset = 30-10 = 20, visibleStart = 20-2 = 18
    expect(capturedRange[0]).toBeGreaterThanOrEqual(16);
  });

  it('shows overflow indicator for hidden content above (pinned to bottom)', () => {
    const { lastFrame } = render(
      <ScrollBox rowCount={100} estimatedRowHeight={1} maxHeight={10} autoPinToBottom={true}>
        {() => <React.Fragment />}
      </ScrollBox>,
    );

    const output = lastFrame();
    // When pinned to bottom, content above is hidden
    expect(output).toContain('earlier rows hidden');
  });

  it('renders with small rowCount that fits in viewport', () => {
    const { lastFrame } = render(
      <ScrollBox rowCount={3} estimatedRowHeight={1} maxHeight={10}>
        {() => <React.Fragment />}
      </ScrollBox>,
    );

    const output = lastFrame();
    // No overflow indicators when everything fits
    expect(output).not.toContain('hidden');
    expect(output).not.toContain('more rows');
  });

  it('accepts buffer parameter for overscan (autoPin=false)', () => {
    let capturedRange: [number, number] = [0, 0];
    render(
      <ScrollBox rowCount={50} estimatedRowHeight={1} maxHeight={10} buffer={5} autoPinToBottom={false}>
        {(start, end) => {
          capturedRange = [start, end];
          return null;
        }}
      </ScrollBox>,
    );

    // Buffer=5 means start=0-5 clamped to 0, end=10+5=15
    expect(capturedRange[0]).toBe(0);
    expect(capturedRange[1]).toBeGreaterThanOrEqual(12);
  });
});