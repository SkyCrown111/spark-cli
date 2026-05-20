/**
 * Spinner component tests
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Spinner, LoadingSpinner } from './Spinner.js';

describe('Spinner component', () => {
  it('renders with default label', () => {
    const { lastFrame } = render(<Spinner />);
    expect(lastFrame()).toContain('Loading...');
  });

  it('renders with custom label', () => {
    const { lastFrame } = render(<Spinner label="Processing..." />);
    expect(lastFrame()).toContain('Processing...');
  });

  it('renders with dots type', () => {
    const { lastFrame } = render(<Spinner type="dots" label="Thinking..." />);
    expect(lastFrame()).toContain('Thinking...');
  });

  it('renders with line type', () => {
    const { lastFrame } = render(<Spinner type="line" label="Working..." />);
    expect(lastFrame()).toContain('Working...');
  });

  it('renders with arc type', () => {
    const { lastFrame } = render(<Spinner type="arc" label="Loading..." />);
    expect(lastFrame()).toContain('Loading...');
  });

  it('renders with custom color', () => {
    const { lastFrame } = render(<Spinner color="green" label="Success" />);
    expect(lastFrame()).toContain('Success');
  });

  it('renders without label', () => {
    const { lastFrame } = render(<Spinner label="" />);
    // Should render spinner but no label text
    const output = lastFrame()!;
    expect(output).toBeTruthy();
    expect(output.trim()).not.toBe('');
  });

  it('LoadingSpinner alias works', () => {
    const { lastFrame } = render(<LoadingSpinner label="Loading..." />);
    expect(lastFrame()).toContain('Loading...');
  });

  it('renders with all props', () => {
    const { lastFrame } = render(
      <Spinner type="dots" label="Custom" color="yellow" />
    );
    expect(lastFrame()).toContain('Custom');
  });
});
