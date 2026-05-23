/**
 * useMessages hook - Message state management
 * Manages chat message history with add, clear, and limit functionality
 */

import { useState, useCallback } from 'react';
import type { ChatMessage } from '../core/providers/openai-compatible.js';

export interface UseMessagesOptions {
  /** Initial messages */
  initialMessages?: ChatMessage[];
  /** Maximum number of messages to keep in history (default: 1000) */
  maxMessages?: number;
}

export interface UseMessagesReturn {
  /** Current message history */
  messages: ChatMessage[];
  /** Add a new message to the history */
  addMessage: (message: ChatMessage) => void;
  /** Add multiple messages to the history */
  addMessages: (messages: ChatMessage[]) => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Remove the last message */
  removeLastMessage: () => void;
  /** Update a message at a specific index */
  updateMessage: (index: number, message: Partial<ChatMessage>) => void;
  /** Get the number of messages */
  messageCount: number;
}

/**
 * Hook to manage chat message state
 *
 * Provides utilities for managing a list of chat messages with
 * automatic history limiting to prevent memory issues.
 *
 * @param options - Configuration options
 * @returns Message state and management functions
 *
 * @example
 * ```tsx
 * const { messages, addMessage, clearMessages } = useMessages({
 *   maxMessages: 1000
 * });
 *
 * // Add a user message
 * addMessage({
 *   role: 'user',
 *   content: 'Hello!'
 * });
 *
 * // Add an assistant message
 * addMessage({
 *   role: 'assistant',
 *   content: 'Hi there!'
 * });
 *
 * // Clear all messages
 * clearMessages();
 * ```
 */
export const useMessages = ({
  initialMessages = [],
  maxMessages = 1000,
}: UseMessagesOptions = {}): UseMessagesReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  /**
   * Add a single message to the history
   * Automatically trims history if it exceeds maxMessages
   */
  const addMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => {
        const newMessages = [...prev, message];

        // Trim history if it exceeds max
        if (newMessages.length > maxMessages) {
          return newMessages.slice(newMessages.length - maxMessages);
        }

        return newMessages;
      });
    },
    [maxMessages],
  );

  /**
   * Add multiple messages to the history
   * Automatically trims history if it exceeds maxMessages
   */
  const addMessages = useCallback(
    (newMessages: ChatMessage[]) => {
      setMessages((prev) => {
        const combined = [...prev, ...newMessages];

        // Trim history if it exceeds max
        if (combined.length > maxMessages) {
          return combined.slice(combined.length - maxMessages);
        }

        return combined;
      });
    },
    [maxMessages],
  );

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /**
   * Remove the last message from history
   */
  const removeLastMessage = useCallback(() => {
    setMessages((prev) => prev.slice(0, -1));
  }, []);

  /**
   * Update a message at a specific index
   */
  const updateMessage = useCallback((index: number, update: Partial<ChatMessage>) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) {
        return prev;
      }

      const newMessages = [...prev];
      newMessages[index] = { ...newMessages[index], ...update } as ChatMessage;
      return newMessages;
    });
  }, []);

  return {
    messages,
    addMessage,
    addMessages,
    clearMessages,
    removeLastMessage,
    updateMessage,
    messageCount: messages.length,
  };
};
