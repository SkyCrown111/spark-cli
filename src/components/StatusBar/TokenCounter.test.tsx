/**
 * Tests for TokenCounter component
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { TokenCounter } from './TokenCounter.js';

describe('TokenCounter', () => {
  it('renders token count correctly', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={1000} tokensBudget={200000} />
    );
    expect(lastFrame()).toContain('Tokens:');
    expect(lastFrame()).toContain('1.0K/200.0K');
  });

  it('formats large numbers with K suffix', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={5000} tokensBudget={10000} />
    );
    expect(lastFrame()).toContain('5.0K/10.0K');
  });

  it('formats very large numbers with M suffix', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={1500000} tokensBudget={2000000} />
    );
    expect(lastFrame()).toContain('1.5M/2.0M');
  });

  it('formats small numbers without suffix', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={100} tokensBudget={500} />
    );
    expect(lastFrame()).toContain('100/500');
  });

  it('hides label when showLabel is false', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={1000} tokensBudget={200000} showLabel={false} />
    );
    expect(lastFrame()).not.toContain('Tokens:');
    expect(lastFrame()).toContain('1.0K/200.0K');
  });

  it('shows percentage when showPercentage is true', () => {
    const { lastFrame } = render(
      <TokenCounter 
        tokensUsed={1000} 
        tokensBudget={10000} 
        showPercentage={true} 
      />
    );
    expect(lastFrame()).toContain('10.0%');
  });

  it('hides percentage by default', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={1000} tokensBudget={10000} />
    );
    expect(lastFrame()).not.toContain('%');
  });

  it('calculates percentage correctly', () => {
    const { lastFrame } = render(
      <TokenCounter 
        tokensUsed={7500} 
        tokensBudget={10000} 
        showPercentage={true} 
      />
    );
    expect(lastFrame()).toContain('75.0%');
  });

  it('handles zero tokens used', () => {
    const { lastFrame } = render(
      <TokenCounter tokensUsed={0} tokensBudget={10000} />
    );
    expect(lastFrame()).toContain('0/10.0K');
  });

  it('handles full token budget', () => {
    const { lastFrame } = render(
      <TokenCounter 
        tokensUsed={10000} 
        tokensBudget={10000} 
        showPercentage={true} 
      />
    );
    expect(lastFrame()).toContain('100.0%');
  });

  it('handles near-budget usage (90%+)', () => {
    const { lastFrame } = render(
      <TokenCounter 
        tokensUsed={9500} 
        tokensBudget={10000} 
        showPercentage={true} 
      />
    );
    expect(lastFrame()).toContain('95.0%');
  });
});
