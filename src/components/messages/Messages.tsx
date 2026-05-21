/**
 * Messages component - Message list container with virtual scrolling.
 *
 * Two modes of operation:
 * 1. **ScrollBox-controlled**: When `visibleRange` is provided, renders only
 *    the messages within [start, end) — the parent ScrollBox handles scrolling.
 * 2. **Self-contained**: When `visibleRange` is absent, uses a simple
 *    tail-window approach (shows the latest messages that fit in maxHeight).
 *
 * After Phase 16-H: supports progress display messages and tool group rendering.
 */

import React, { useMemo } from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { UserMessage } from './UserMessage.js';
import { AssistantMessage } from './AssistantMessage.js';
import { ToolMessage } from './ToolMessage.js';
import { ProgressMessage } from './ProgressMessage.js';
import { isProgressMessage, type DisplayMessage } from './DisplayMessage.js';
import type { ChatMessage } from '../../core/providers/openai-compatible.js';

export interface MessagesProps {
  messages: ChatMessage[] | DisplayMessage[];
  /** Max visible height in terminal rows (used for virtual scroll window) */
  maxHeight?: number;
  /**
   * Visible range [start, end) from ScrollBox.
   * When provided, ScrollBox controls which messages are visible
   * and this component only renders messages in that range.
   */
  visibleRange?: [number, number];
  /** Partial assistant content being streamed via onDelta */
  streamingContent?: string;
  /** Whether the agent is currently streaming a response */
  isStreaming?: boolean;
}

/**
 * Render a single message based on its role.
 */
function renderMessage(msg: ChatMessage | DisplayMessage, key: number | string) {
  // Handle display-only types first
  if (isProgressMessage(msg)) {
    return <ProgressMessage key={key} label={msg.label} current={msg.current} total={msg.total} percent={msg.percent} status={msg.status} />;
  }

  // Standard ChatMessage types
  switch (msg.role) {
    case 'user':
      return <UserMessage key={key} message={msg} />;
    case 'assistant':
      return <AssistantMessage key={key} message={msg} />;
    case 'tool':
      return <ToolMessage key={key} message={msg} />;
    case 'system':
      return null;
    default:
      return null;
  }
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
  visibleRange,
  streamingContent,
  isStreaming,
}) => {
  // ScrollBox-controlled mode: use the range provided by ScrollBox
  if (visibleRange) {
    const [start, end] = visibleRange;
    const slicedMessages = messages.slice(start, end);

    return (
      <Box flexDirection="column">
        {slicedMessages.map((msg, idx) => {
          const globalIdx = start + idx;
          return renderMessage(msg, globalIdx);
        })}
        {isStreaming && streamingContent && (
          <AssistantMessage
            key="streaming"
            message={{ role: 'assistant', content: streamingContent }}
          />
        )}
      </Box>
    );
  }

  // Self-contained mode: simple tail-window virtual scroll
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
      {visibleMessages.map((msg, idx) => renderMessage(msg, idx))}
      {isStreaming && streamingContent && (
        <AssistantMessage
          key="streaming"
          message={{ role: 'assistant', content: streamingContent }}
        />
      )}
    </Box>
  );
};
