/**
 * AssistantMessage component - Displays AI assistant messages
 * Shows messages from the AI with Markdown rendering support
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { colors } from '../../theme/colors.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import type { AssistantMessage as AssistantMessageType } from '../../core/providers/openai-compatible.js';

export interface AssistantMessageProps {
  message: AssistantMessageType;
}

/**
 * Formats message content, handling both string and content parts
 */
function formatContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') {
    return content;
  }
  
  // Handle content parts
  return content
    .map(part => {
      if (part.type === 'text' && part.text) {
        return part.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * AssistantMessage component for displaying AI responses
 * Supports Markdown formatting for rich text display
 * 
 * @example
 * ```tsx
 * <AssistantMessage message={{ role: 'assistant', content: '**Hello!** How can I help?' }} />
 * ```
 */
export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const content = formatContent(message.content);
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text bold color={colors.assistant}>Assistant:</Text>
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {content && content.trim() && (
          <MarkdownRenderer>{content}</MarkdownRenderer>
        )}
        {hasToolCalls && (
          <Box marginTop={1}>
            <Text dimColor italic>
              [Calling {message.tool_calls!.length} tool{message.tool_calls!.length > 1 ? 's' : ''}...]
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
