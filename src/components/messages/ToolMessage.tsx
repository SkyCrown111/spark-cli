/**
 * ToolMessage component - Displays tool call results
 * Shows the results of tool executions with appropriate styling
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { colors } from '../../theme/colors.js';
import type { ToolMessage as ToolMessageType } from '../../core/providers/openai-compatible.js';

export interface ToolMessageProps {
  message: ToolMessageType;
}

/**
 * Truncates long content for display
 */
function truncateContent(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '...';
}

/**
 * ToolMessage component for displaying tool execution results
 * 
 * @example
 * ```tsx
 * <ToolMessage message={{ role: 'tool', content: 'Result data', tool_call_id: '123' }} />
 * ```
 */
export const ToolMessage: React.FC<ToolMessageProps> = ({ message }) => {
  const truncated = truncateContent(message.content);
  const isTruncated = truncated !== message.content;
  
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text bold color={colors.tool}>Tool Result:</Text>
        <Text dimColor> (ID: {message.tool_call_id})</Text>
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        <Text dimColor>{truncated}</Text>
        {isTruncated && (
          <Text dimColor italic> [truncated]</Text>
        )}
      </Box>
    </Box>
  );
};
