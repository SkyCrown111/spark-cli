/**
 * CompactBoundaryMessage — marks the boundary between
 * compacted (summarized) history and live messages.
 *
 * When conversation history is compacted to save token budget,
 * this component shows a visual separator indicating where
 * the compaction occurred.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface CompactBoundaryMessageProps {
  /** Number of messages that were compacted */
  compactedCount: number;
  /** Token savings from compaction */
  tokensSaved?: number;
}

export const CompactBoundaryMessage: React.FC<CompactBoundaryMessageProps> = ({
  compactedCount,
  tokensSaved,
}) => {
  return (
    <Box
      flexDirection="column"
      paddingX={1}
    >
      <Box flexDirection="row" gap={1}>
        <Text dimColor>──</Text>
        <Text dimColor bold>
          {compactedCount} earlier messages compacted
        </Text>
        <Text dimColor>──</Text>
      </Box>
      {tokensSaved !== undefined && (
        <Text dimColor>Saved ~{tokensSaved} tokens</Text>
      )}
    </Box>
  );
};
