/**
 * AssistantThinkingMessage — displays the model's chain-of-thought
 * or "thinking" output in a collapsible, dimmed block.
 *
 * Inspired by Claude Code's thinking message display.
 * When the model produces extended reasoning (e.g. o1-style thinking),
 * it is shown in a dimmed, collapsible block below the assistant header.
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';

export interface AssistantThinkingMessageProps {
  /** The thinking/reasoning content */
  content: string;
  /** Maximum lines to show before collapsing (default: 5) */
  maxVisibleLines?: number;
}

/**
 * AssistantThinkingMessage — collapsible thinking block.
 */
export const AssistantThinkingMessage: React.FC<AssistantThinkingMessageProps> = ({
  content,
  maxVisibleLines = 5,
}) => {
  const lines = content.split('\n');
  const visibleLines = lines.slice(0, maxVisibleLines);

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text dimColor italic>{'⏺ Thinking...'}</Text>
      </Box>
      {visibleLines.map((line, i) => (
        <Box key={i} paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {line}
          </Text>
        </Box>
      ))}
    </Box>
  );
};
