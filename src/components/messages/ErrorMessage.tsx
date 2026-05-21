/**
 * ErrorMessage component - Displays friendly error messages with color and recovery hints
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';

export interface ErrorMessageProps {
  /** The error message */
  message: string;
  /** Optional error code or type */
  code?: string;
  /** Recovery suggestions */
  hints?: string[];
  /** Whether this is a network error */
  isNetworkError?: boolean;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  code,
  hints,
  isNetworkError = false,
}) => {
  const title = code ? `Error (${code})` : 'Error';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="red">{isNetworkError ? '! Network Error' : `! ${title}`}</Text>
      </Box>
      <Box>
        <Text color="red">{message}</Text>
      </Box>
      {hints && hints.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Suggestions:</Text>
          {hints.map((hint, i) => (
            <Box key={i} paddingLeft={1}>
              <Text dimColor>• {hint}</Text>
            </Box>
          ))}
        </Box>
      )}
      {isNetworkError && (
        <Box marginTop={1}>
          <Text dimColor>Check your internet connection and try again.</Text>
        </Box>
      )}
    </Box>
  );
};
