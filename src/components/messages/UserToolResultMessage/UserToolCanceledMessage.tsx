/**
 * UserToolCanceledMessage — renders a canceled tool result.
 *
 * Shows a dimmed gray display for tool calls that were
 * canceled by the user.
 */

import React from 'react';
import { Box } from '../../design-system/Box.js';
import { Text } from '../../design-system/Text.js';

export interface UserToolCanceledMessageProps {
  toolLabel: string;
  content: string;
}

export const UserToolCanceledMessage: React.FC<UserToolCanceledMessageProps> = ({
  toolLabel,
  content,
}) => {
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor bold>
          {'>'} {toolLabel}
        </Text>
        <Text dimColor> — canceled</Text>
      </Box>
      {content && (
        <Box paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {content}
          </Text>
        </Box>
      )}
    </Box>
  );
};
