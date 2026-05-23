/**
 * UserToolRejectMessage — renders a rejected tool result.
 *
 * Shows a yellow-bordered rejection display when the user
 * explicitly rejected the tool call.
 */

import React from 'react';
import { Box } from '../../design-system/Box.js';
import { Text } from '../../design-system/Text.js';

export interface UserToolRejectMessageProps {
  toolLabel: string;
  content: string;
}

export const UserToolRejectMessage: React.FC<UserToolRejectMessageProps> = ({
  toolLabel,
  content,
}) => {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="yellow">
          {'>'} {toolLabel}
        </Text>
        <Text color="yellow"> — rejected</Text>
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
