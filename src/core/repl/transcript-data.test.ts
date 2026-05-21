/**
 * Tests for transcript-data.ts
 */

import { describe, it, expect } from 'vitest';
import { buildTranscriptData } from './transcript-data.js';
import type { ChatMessage } from '../providers/openai-compatible.js';

describe('buildTranscriptData', () => {
  it('returns empty array for empty history', () => {
    const result = buildTranscriptData([]);
    expect(result).toEqual([]);
  });

  it('skips system messages', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const result = buildTranscriptData(history);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('Hello');
  });

  it('builds entries for user and assistant messages', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '2+2 = 4' },
    ];
    const result = buildTranscriptData(history);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      role: 'user',
      content: 'What is 2+2?',
      toolCalls: [],
    });
    expect(result[1]).toMatchObject({
      role: 'assistant',
      content: '2+2 = 4',
      toolCalls: [],
    });
  });

  it('assigns unique keys to entries', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    const result = buildTranscriptData(history);
    expect(result[0].key).not.toBe(result[1].key);
    expect(result[0].key).toBe('msg-0');
    expect(result[1].key).toBe('msg-1');
  });

  it('tracks original index in history', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    const result = buildTranscriptData(history);
    // system is skipped, so user is index 1, assistant is index 2
    expect(result[0].index).toBe(1);
    expect(result[1].index).toBe(2);
  });

  it('pairs assistant tool_calls with tool results', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Read file.txt' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"file.txt"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: 'File contents here',
        tool_call_id: 'call_123',
      },
    ];
    const result = buildTranscriptData(history);
    expect(result).toHaveLength(2); // user + assistant (tool messages are consumed)

    const assistantEntry = result[1];
    expect(assistantEntry.toolCalls).toHaveLength(1);
    expect(assistantEntry.toolCalls[0]).toMatchObject({
      id: 'call_123',
      name: 'read_file',
      args: '{"path":"file.txt"}',
      result: 'File contents here',
    });
  });

  it('handles multiple tool calls in one assistant message', () => {
    const history: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'Let me read two files.',
        tool_calls: [
          {
            id: 'call_a',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
          },
          {
            id: 'call_b',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"b.txt"}' },
          },
        ],
      },
      { role: 'tool', content: 'Contents of A', tool_call_id: 'call_a' },
      { role: 'tool', content: 'Contents of B', tool_call_id: 'call_b' },
    ];
    const result = buildTranscriptData(history);
    expect(result).toHaveLength(1);
    expect(result[0].toolCalls).toHaveLength(2);
    expect(result[0].toolCalls[0].result).toBe('Contents of A');
    expect(result[0].toolCalls[1].result).toBe('Contents of B');
  });

  it('handles tool calls without matching results', () => {
    const history: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_orphan',
            type: 'function',
            function: { name: 'unknown_tool', arguments: '{}' },
          },
        ],
      },
    ];
    const result = buildTranscriptData(history);
    expect(result[0].toolCalls[0].result).toBeUndefined();
  });

  it('handles content parts array for assistant messages', () => {
    const history: ChatMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      },
    ];
    const result = buildTranscriptData(history);
    expect(result[0].content).toBe('Hello \nworld');
  });

  it('handles content parts array for user messages', () => {
    const history: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at' },
          { type: 'text', text: 'this image' },
        ],
      },
    ];
    const result = buildTranscriptData(history);
    expect(result[0].content).toBe('Look at\nthis image');
  });

  it('extracts duration from tool result timing metadata', () => {
    const history: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_timed',
            type: 'function',
            function: { name: 'slow_tool', arguments: '{}' },
          },
        ],
      },
      {
        role: 'tool',
        content: 'Result [duration: 1234ms]',
        tool_call_id: 'call_timed',
      },
    ];
    const result = buildTranscriptData(history);
    expect(result[0].toolCalls[0].durationMs).toBe(1234);
  });

  it('sets duration to undefined when no timing metadata', () => {
    const history: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_notimed',
            type: 'function',
            function: { name: 'fast_tool', arguments: '{}' },
          },
        ],
      },
      {
        role: 'tool',
        content: 'Quick result',
        tool_call_id: 'call_notimed',
      },
    ];
    const result = buildTranscriptData(history);
    expect(result[0].toolCalls[0].durationMs).toBeUndefined();
  });
});
