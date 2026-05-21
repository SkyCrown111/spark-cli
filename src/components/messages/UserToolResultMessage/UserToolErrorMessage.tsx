/**
 * UserToolErrorMessage — renders an error tool result.
 *
 * Shows a red-bordered error display with the error content.
 */

import React from 'react';
import { Box } from '../../design-system/Box.js';
import { Text } from '../../design-system/Text.js';

export interface UserToolErrorMessageProps {
  toolLabel: string;
  content: string;
}

export const UserToolErrorMessage: React.FC<UserToolErrorMessageProps> = ({
  toolLabel,
  content,
}) => {
  return (
    <Box
      flexDirection="column"
      paddingX={1}
    >
      <Box>
        <Text bold color="red">! {toolLabel}</Text>
        <Text color="red"> — error</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="red" wrap="wrap">{content}</Text>
      </Box>
    </Box>
  );
};
