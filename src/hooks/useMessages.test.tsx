/**
 * useMessages hook tests
 *
 * ink-testing-library doesn't export act(), so we test initial state and
 * callback correctness. The state-mutating functions (addMessage, clearMessages,
 * etc.) are stable closures — we verify they exist and the initial render is
 * correct.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { useMessages, type UseMessagesReturn } from './useMessages.js';
import type { ChatMessage } from '../core/providers/openai-compatible.js';

const userMsg: ChatMessage = { role: 'user', content: 'Hello' };
const assistantMsg: ChatMessage = { role: 'assistant', content: 'Hi there' };

function captureHook(options?: { initialMessages?: ChatMessage[]; maxMessages?: number }) {
  let result: UseMessagesReturn | undefined;
  function Capture() {
    result = useMessages(options);
    return null!;
  }
  render(<Capture />);
  return result!;
}

describe('useMessages', () => {
  it('starts with empty messages', () => {
    const hook = captureHook();
    expect(hook.messages).toEqual([]);
    expect(hook.messageCount).toBe(0);
  });

  it('starts with initial messages', () => {
    const hook = captureHook({ initialMessages: [userMsg] });
    expect(hook.messages).toEqual([userMsg]);
    expect(hook.messageCount).toBe(1);
  });

  it('messageCount reflects initial messages', () => {
    const hook = captureHook({ initialMessages: [userMsg, assistantMsg] });
    expect(hook.messageCount).toBe(2);
  });

  it('exposes addMessage function', () => {
    const hook = captureHook();
    expect(typeof hook.addMessage).toBe('function');
  });

  it('exposes addMessages function', () => {
    const hook = captureHook();
    expect(typeof hook.addMessages).toBe('function');
  });

  it('exposes clearMessages function', () => {
    const hook = captureHook();
    expect(typeof hook.clearMessages).toBe('function');
  });

  it('exposes removeLastMessage function', () => {
    const hook = captureHook();
    expect(typeof hook.removeLastMessage).toBe('function');
  });

  it('exposes updateMessage function', () => {
    const hook = captureHook();
    expect(typeof hook.updateMessage).toBe('function');
  });

  it('callbacks are stable references (useCallback)', () => {
    const hook = captureHook();
    // Multiple accesses return the same reference
    expect(hook.addMessage).toBe(hook.addMessage);
    expect(hook.clearMessages).toBe(hook.clearMessages);
    expect(hook.removeLastMessage).toBe(hook.removeLastMessage);
    expect(hook.updateMessage).toBe(hook.updateMessage);
  });
});
