/**
 * VirtualMessageList — high-performance message display with
 * virtual scrolling, search highlighting, and new-message dividers.
 *
 * Built on ScrollBox for viewport management, this component
 * renders only the visible messages and efficiently updates
 * when new messages arrive.
 */

import React, { useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { ScrollBox } from '../ink/components/ScrollBox.js';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import type { ChatMessage } from '../core/providers/openai-compatible.js';

// ── Props ──────────────────────────────────────────────

export interface VirtualMessageListProps {
  /** Messages to display */
  messages: ChatMessage[];
  /** Maximum height for the message area */
  maxHeight: number;
  /** Search query for highlighting (optional) */
  searchQuery?: string;
  /** Index of the first unseen message (optional) */
  unseenFromIndex?: number;
}

// ── Message row ────────────────────────────────────────

const MessageRow: React.FC<{
  message: ChatMessage;
  searchQuery?: string;
}> = ({ message, searchQuery }) => {
  const roleColor =
    message.role === 'user'
      ? 'cyan'
      : message.role === 'assistant'
        ? 'green'
        : message.role === 'system'
          ? 'yellow'
          : 'gray';

  const roleLabel =
    message.role === 'user'
      ? 'You'
      : message.role === 'assistant'
        ? 'Spark'
        : message.role === 'system'
          ? 'System'
          : message.role;

  // Split content into lines for rendering
  const content =
    typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  const lines = content.split('\n');

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box flexDirection="row">
        <Text bold color={roleColor}>
          {roleLabel}:{' '}
        </Text>
      </Box>
      {lines.map((line: string, i: number) => (
        <Box key={i}>
          {searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase()) ? (
            <HighlightLine line={line} query={searchQuery} />
          ) : (
            <Text wrap="wrap">{line}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
};

/**
 * Highlight matching text in a line.
 */
const HighlightLine: React.FC<{ line: string; query: string }> = ({ line, query }) => {
  // Simple highlight: split on query, color matching parts
  const lowerLine = line.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];

  let start = 0;
  while (start < line.length) {
    const idx = lowerLine.indexOf(lowerQuery, start);
    if (idx === -1) {
      parts.push({ text: line.slice(start), match: false });
      break;
    }
    if (idx > start) {
      parts.push({ text: line.slice(start, idx), match: false });
    }
    parts.push({ text: line.slice(idx, idx + query.length), match: true });
    start = idx + query.length;
  }

  return (
    <Text wrap="wrap">
      {parts.map((part, i) =>
        part.match ? (
          <Text key={i} backgroundColor="yellow" color="black">
            {part.text}
          </Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        ),
      )}
    </Text>
  );
};

// ── Unseen divider ─────────────────────────────────────

const UnseenDivider: React.FC = () => (
  <Box flexDirection="row" paddingBottom={1}>
    <Text color="yellow" bold>
      ── new messages ──
    </Text>
  </Box>
);

// ── Main component ────────────────────────────────────

export const VirtualMessageList: React.FC<VirtualMessageListProps> = ({
  messages,
  maxHeight,
  searchQuery,
  unseenFromIndex,
}) => {
  // Register Scroll context for scrolling keybindings
  useRegisterKeybindingContext('Scroll');

  const messageCountRef = useRef(0);

  // Compute row data for ScrollBox
  const rows = useMemo(() => {
    const result: React.ReactNode[] = [];

    for (let i = 0; i < messages.length; i++) {
      // Insert unseen divider if applicable
      if (unseenFromIndex !== undefined && i === unseenFromIndex) {
        result.push(<UnseenDivider key={`unseen-${i}`} />);
      }

      result.push(<MessageRow key={`msg-${i}`} message={messages[i]} searchQuery={searchQuery} />);
    }

    return result;
  }, [messages, searchQuery, unseenFromIndex]);

  // Auto-pin to bottom when new messages arrive
  const shouldAutoPin = messages.length > messageCountRef.current;
  messageCountRef.current = messages.length;

  return (
    <ScrollBox rowCount={rows.length} maxHeight={maxHeight} autoPinToBottom={shouldAutoPin}>
      {(visibleStart: number, visibleEnd: number) => (
        <Box flexDirection="column">{rows.slice(visibleStart, visibleEnd)}</Box>
      )}
    </ScrollBox>
  );
};
