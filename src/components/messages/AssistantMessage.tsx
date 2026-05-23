/**
 * AssistantMessage component - Displays AI assistant messages.
 *
 * After Phase 16-H: supports:
 * - Thinking content (chain-of-thought) rendered as collapsible block
 * - Tool call grouping with compact headers
 * - Markdown rendering for text content
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { AssistantThinkingMessage } from './AssistantThinkingMessage.js';
import type { AssistantMessage as AssistantMessageType } from '../../core/providers/openai-compatible.js';

export interface AssistantMessageProps {
  message: AssistantMessageType;
}

/**
 * Formats message content, handling both string and content parts.
 * Also extracts thinking content from content parts.
 */
function formatContent(content: string | Array<{ type: string; text?: string }>): {
  text: string;
  thinking?: string;
} {
  if (typeof content === 'string') {
    return { text: content };
  }

  // Handle content parts — separate thinking from text
  let text = '';
  let thinking: string | undefined;

  for (const part of content) {
    if (part.type === 'text' && part.text) {
      text += part.text;
    } else if (part.type === 'thinking' && part.text) {
      thinking = (thinking ?? '') + part.text;
    }
  }

  return { text, thinking };
}

/**
 * AssistantMessage component for displaying AI responses.
 *
 * Supports:
 * - Markdown formatting for rich text display
 * - Thinking/chain-of-thought blocks (collapsible)
 * - Tool call indicators with grouping
 *
 * @example
 * ```tsx
 * <AssistantMessage message={{ role: 'assistant', content: '**Hello!** How can I help?' }} />
 * ```
 */
export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const { text, thinking } = formatContent(message.content);
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;

  return (
    <Box flexDirection="column">
      {/* Thinking block (if present) */}
      {thinking && <AssistantThinkingMessage content={thinking} />}

      {/* Text content */}
      {text && text.trim() && <MarkdownRenderer>{text}</MarkdownRenderer>}

      {/* Tool calls indicator */}
      {hasToolCalls && (
        <Box flexDirection="column">
          {message.tool_calls!.map((tc, idx) => {
            let toolName = 'tool';
            if (typeof tc === 'object' && 'function' in tc) {
              toolName = (tc as { function: { name: string } }).function.name;
            }

            return (
              <Box key={idx}>
                <Text color="yellow">{'⏺'}</Text>
                <Text dimColor> {toolName}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
