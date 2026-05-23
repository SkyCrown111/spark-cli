/**
 * RateLimitMessage — displays a rate limit warning.
 *
 * When the API returns a rate limit error (429), this component
 * shows a prominent warning with retry timing information.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface RateLimitMessageProps {
  /** Seconds until the rate limit resets */
  retryAfterSeconds?: number;
  /** The model that was rate limited */
  model?: string;
}

export const RateLimitMessage: React.FC<RateLimitMessageProps> = ({ retryAfterSeconds, model }) => {
  const retryText = retryAfterSeconds
    ? `Retry in ${retryAfterSeconds}s`
    : 'Please wait before retrying';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text color="yellow" bold>
          !
        </Text>
        <Text color="yellow" bold>
          Rate limit reached
        </Text>
        {model && <Text dimColor>({model})</Text>}
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>{retryText}</Text>
      </Box>
    </Box>
  );
};
