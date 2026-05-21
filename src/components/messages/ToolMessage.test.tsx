/**
 * ToolMessage component tests
 *
 * After Phase 16-H: ToolMessage integrates collapseToolResults
 * and StructuredDiff. Tests updated for new rendering.
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

    expect(output).toContain('Tool');
    expect(output).toContain('Tool execution successful');
  });

  it('renders tool_call_id as label when not a call_ prefix', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: 'Result',
      tool_call_id: 'my-custom-id'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('my-custom-id');
    expect(output).toContain('Result');
  });

  it('renders "Tool" label for call_ prefixed IDs', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: 'Result',
      tool_call_id: 'call_abc123'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Tool');
    expect(output).toContain('Result');
  });

  it('collapses long content (>15 lines)', () => {
    const longContent = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n');
    const message: ToolMessageType = {
      role: 'tool',
      content: longContent,
      tool_call_id: 'call_long'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('30 lines');
    expect(output).toContain('collapsed');
    // Should show first few and last few lines
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 30');
  });

  it('does not collapse short content', () => {
    const shortContent = 'Line 1\nLine 2\nLine 3';
    const message: ToolMessageType = {
      role: 'tool',
      content: shortContent,
      tool_call_id: 'call_short'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).not.toContain('collapsed');
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 3');
  });

  it('renders empty content', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: '',
      tool_call_id: 'call_empty'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Tool');
  });

  it('renders JSON content', () => {
    const message: ToolMessageType = {
      role: 'tool',
      content: '{"status": "success", "data": [1, 2, 3]}',
      tool_call_id: 'call_json'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('status');
    expect(output).toContain('success');
  });

  it('detects and renders diff content', () => {
    const diffContent = [
      '--- a/file.ts (original)',
      '+++ b/file.ts (modified)',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-old line',
      '+new line',
      ' line3',
    ].join('\n');

    const message: ToolMessageType = {
      role: 'tool',
      content: diffContent,
      tool_call_id: 'call_diff'
    };

    const { lastFrame } = render(<ToolMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('diff');
    expect(output).toContain('new line');
  });

  it('shows expanded content when expanded prop is true', () => {
    const longContent = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n');
    const message: ToolMessageType = {
      role: 'tool',
      content: longContent,
      tool_call_id: 'call_expanded'
    };

    const { lastFrame } = render(<ToolMessage message={message} expanded={true} />);
    const output = lastFrame();

    // When expanded, all lines should be visible (no collapse)
    expect(output).not.toContain('collapsed');
    // Should contain all 30 lines
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 30');
  });
});
