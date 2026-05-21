/**
 * HookProgressMessage — displays hook execution progress.
 *
 * When a pre/post hook is running (e.g., linting after file write),
 * this component shows the hook name and execution status.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface HookProgressMessageProps {
  /** Hook name being executed */
  hookName: string;
  /** Hook type (pre-tool-use, post-tool-use, etc.) */
  hookType?: string;
  /** Whether the hook is still running */
  running?: boolean;
  /** Exit code if completed */
  exitCode?: number;
}

export const HookProgressMessage: React.FC<HookProgressMessageProps> = ({
  hookName,
  hookType,
  running = true,
  exitCode,
}) => {
  const statusIcon = running
    ? '⏺'
    : exitCode === 0
      ? '✓'
      : '✗';

  const statusColor = running
    ? 'yellow'
    : exitCode === 0
      ? 'green'
      : 'red';

  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text color={statusColor}>{statusIcon}</Text>
      <Text bold>{hookName}</Text>
      {hookType && <Text dimColor>({hookType})</Text>}
      {exitCode !== undefined && !running && (
        <Text color={statusColor}>
          {exitCode === 0 ? 'passed' : `failed (exit ${exitCode})`}
        </Text>
      )}
    </Box>
  );
};
