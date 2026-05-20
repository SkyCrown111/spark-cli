/**
 * Tests for StatusBar component
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { StatusBar } from './StatusBar.js';

describe('StatusBar', () => {
  it('renders all components correctly', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={1000}
        tokensBudget={200000}
        model="gpt-4"
      />
    );
    
    expect(lastFrame()).toContain('Mode:');
    expect(lastFrame()).toContain('Chat');
    expect(lastFrame()).toContain('Model:');
    expect(lastFrame()).toContain('gpt-4');
    expect(lastFrame()).toContain('Tokens:');
    expect(lastFrame()).toContain('1.0K/200.0K');
  });

  it('renders with direct mode', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="direct"
        tokensUsed={5000}
        tokensBudget={100000}
        model="claude-3-opus"
      />
    );
    
    expect(lastFrame()).toContain('Direct');
    expect(lastFrame()).toContain('claude-3-opus');
  });

  it('renders with plan mode', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="plan"
        tokensUsed={10000}
        tokensBudget={50000}
        model="gpt-4-turbo"
      />
    );
    
    expect(lastFrame()).toContain('Plan');
    expect(lastFrame()).toContain('gpt-4-turbo');
  });

  it('displays optional status text', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={1000}
        tokensBudget={200000}
        model="gpt-4"
        status="Processing..."
      />
    );
    
    expect(lastFrame()).toContain('Status:');
    expect(lastFrame()).toContain('Processing...');
  });

  it('hides status text when not provided', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={1000}
        tokensBudget={200000}
        model="gpt-4"
      />
    );
    
    expect(lastFrame()).not.toContain('Status:');
  });

  it('shows token percentage when enabled', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={10000}
        tokensBudget={100000}
        model="gpt-4"
        showTokenPercentage={true}
      />
    );
    
    expect(lastFrame()).toContain('10.0%');
  });

  it('hides token percentage by default', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={10000}
        tokensBudget={100000}
        model="gpt-4"
      />
    );
    
    expect(lastFrame()).not.toContain('%');
  });

  it('renders without border when showBorder is false', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={1000}
        tokensBudget={200000}
        model="gpt-4"
        showBorder={false}
      />
    );
    
    // Should still contain content
    expect(lastFrame()).toContain('Mode:');
    expect(lastFrame()).toContain('Model:');
    expect(lastFrame()).toContain('Tokens:');
  });

  it('handles different model names', () => {
    const models = ['gpt-4', 'claude-3-opus', 'deepseek-chat', 'gemini-pro'];
    
    models.forEach(model => {
      const { lastFrame } = render(
        <StatusBar 
          mode="chat"
          tokensUsed={1000}
          tokensBudget={200000}
          model={model}
        />
      );
      
      expect(lastFrame()).toContain(model);
    });
  });

  it('handles high token usage', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={180000}
        tokensBudget={200000}
        model="gpt-4"
        showTokenPercentage={true}
      />
    );
    
    expect(lastFrame()).toContain('180.0K/200.0K');
    expect(lastFrame()).toContain('90.0%');
  });

  it('handles zero token usage', () => {
    const { lastFrame } = render(
      <StatusBar 
        mode="chat"
        tokensUsed={0}
        tokensBudget={200000}
        model="gpt-4"
      />
    );
    
    expect(lastFrame()).toContain('0/200.0K');
  });

  it('integrates all three modes correctly', () => {
    const modes = ['chat', 'direct', 'plan'] as const;
    
    modes.forEach(mode => {
      const { lastFrame } = render(
        <StatusBar 
          mode={mode}
          tokensUsed={1000}
          tokensBudget={200000}
          model="gpt-4"
        />
      );
      
      expect(lastFrame()).toContain('Mode:');
      expect(lastFrame()).toContain('Model:');
      expect(lastFrame()).toContain('Tokens:');
    });
  });
});
