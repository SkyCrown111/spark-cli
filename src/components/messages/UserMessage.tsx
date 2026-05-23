/**
 * UserMessage component - Displays user messages
 * Shows messages sent by the user with appropriate styling
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { colors } from '../../theme/colors.js';
import type { UserMessage as UserMessageType } from '../../core/providers/openai-compatible.js';

export interface UserMessageProps {
  message: UserMessageType;
}

/**
 * Formats message content, handling both string and content parts
 */
function formatContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') {
    return content;
  }

  // Handle content parts (e.g., text + images)
  return content
    .map((part) => {
      if (part.type === 'text' && part.text) {
        return part.text;
      }
      if (part.type === 'image_url') {
        return '[Image]';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * UserMessage component for displaying user input
 *
 * @example
 * ```tsx
 * <UserMessage message={{ role: 'user', content: 'Hello!' }} />
 * ```
 */
export const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const content = formatContent(message.content);

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={colors.user}>
          {'>'}
        </Text>
        <Text> {content}</Text>
      </Box>
    </Box>
  );
};
