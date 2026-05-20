/**
 * Messages component - Message list container with virtual scrolling
 * Only renders messages within the visible viewport to avoid performance issues
 * with large message histories.
 *
 * The parent Box controls the available height via flex layout and
 * overflow="hidden" — this component simply renders as many messages
 * as it can and relies on the parent to clip overflow.
 */

import React, { useMemo } from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { UserMessage } from './UserMessage.js';
import { AssistantMessage } from './AssistantMessage.js';
import { ToolMessage } from './ToolMessage.js';
import type { ChatMessage } from '../../core/providers/openai-compatible.js';

export interface MessagesProps {
  messages: ChatMessage[];
  /** Max visible height in terminal rows (used for virtual scroll window) */
  maxHeight?: number;
}

/**
 * Messages component with virtual scrolling.
 * Renders all messages but is clipped by the parent container's
 * overflow="hidden". When maxHeight is provided, uses virtual
 * scrolling to render only the visible subset for performance.
 */
export const Messages: React.FC<MessagesProps> = ({
  messages,
  maxHeight = 30,
}) => {
  // Virtual scroll: only render messages that fit in the maxHeight window
  // Always show the latest messages (scroll to bottom)
  const estimatedRowHeight = 3;
  const visibleCount = Math.ceil(maxHeight / estimatedRowHeight);

  const visibleMessages = useMemo(() => {
    // Show the latest messages (bottom of conversation)
    const start = Math.max(0, messages.length - visibleCount);
    return messages.slice(start, messages.length);
  }, [messages, visibleCount]);

  const hiddenAbove = messages.length > visibleCount;

  return (
    <Box flexDirection="column">
      {hiddenAbove && (
        <Box paddingX={1}>
          <Text dimColor>↑ {messages.length - visibleCount} earlier messages</Text>
        </Box>
      )}
      {visibleMessages.map((msg, idx) => {
        switch (msg.role) {
          case 'user':
            return <UserMessage key={idx} message={msg} />;
          case 'assistant':
            return <AssistantMessage key={idx} message={msg} />;
          case 'tool':
            return <ToolMessage key={idx} message={msg} />;
          case 'system':
            return null;
          default:
            return null;
        }
      })}
    </Box>
  );
};