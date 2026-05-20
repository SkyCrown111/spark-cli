/**
 * ToolMessage component tests
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolMessage } from './ToolMessage.js';
import type { ToolMessage as ToolMessageType } from '../../core/providers/openai-compatible.js';

describe('ToolMessage component', () => {
  it('renders tool message with short content', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: 'Tool execution successful',
      tool_call_id: 'call_123'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_123');
    expect(output).toContain('Tool execution successful');
  });

  it('truncates long content', () => {
    const longContent = 'A'.repeat(300);
    const message: ToolMessageType = {
      role: 'tool',
      content: longContent,
      tool_call_id: 'call_456'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_456');
    expect(output).toContain('...');
    expect(output).toContain('[truncated]');
    // Should not contain the full content
    expect(output).not.toContain(longContent);
  });

  it('does not truncate content at exactly 200 chars', () => {
    const content = 'A'.repeat(200);
    const message: ToolMessageType = {
      role: 'tool',
      content: content,
      tool_call_id: 'call_789'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_789');
    expect(output).not.toContain('[truncated]');
  });

  it('renders empty content', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: '',
      tool_call_id: 'call_empty'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_empty');
  });

  it('renders JSON content', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: '{"status": "success", "data": [1, 2, 3]}',
      tool_call_id: 'call_json'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_json');
    expect(output).toContain('status');
    expect(output).toContain('success');
  });

  it('renders multiline content', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: 'Line 1\nLine 2\nLine 3',
      tool_call_id: 'call_multiline'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_multiline');
    expect(output).toContain('Line 1');
  });

  it('handles special characters in tool_call_id', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: 'Result',
      tool_call_id: 'call_123-abc_xyz'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('call_123-abc_xyz');
    expect(output).toContain('Result');
  });

  it('truncates at exactly 201 characters', () => {
    const content = 'A'.repeat(201);
    const message: ToolMessageType = {
      role: 'tool',
      content: content,
      tool_call_id: 'call_201'
    };
    
    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();
    
    expect(output).toContain('Tool Result:');
    expect(output).toContain('[truncated]');
  });
});
