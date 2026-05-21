/**
 * ProgressMessage — displays progress updates from tool execution.
 *
 * Shows a compact progress indicator with:
 * - Tool name / operation
 * - Current step / total steps (if available)
 * - Progress bar (optional)
 * - Status text
 *
 * Inspired by Claude Code's tool progress display.
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';

export interface ProgressMessageProps {
  /** Tool or operation name */
  label: string;
  /** Current step (1-based) */
  current?: number;
  /** Total steps */
  total?: number;
  /** Status text */
  status?: string;
  /** Progress percentage (0-100), overrides current/total */
  percent?: number;
}

/**
 * Render a simple progress bar.
 */
function ProgressBar({ percent, width = 20 }: { percent: number; width?: number }) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Text color="cyan">{bar}</Text>
  );
}

/**
 * ProgressMessage — compact progress display for tool operations.
 */
export const ProgressMessage: React.FC<ProgressMessageProps> = ({
  label,
  current,
  total,
  status,
  percent,
}) => {
  // Compute percentage
  const pct = percent ?? (total && current ? Math.round((current / total) * 100) : undefined);

  return (
    <Box flexDirection="column" marginY={0}>
      <Box flexDirection="row" gap={1}>
        <Text color="cyan" bold>{'⏺'}</Text>
        <Text bold>{label}</Text>
        {pct !== undefined && (
          <Text dimColor>{pct}%</Text>
        )}
        {status && (
          <Text dimColor>— {status}</Text>
        )}
      </Box>
      {pct !== undefined && pct < 100 && (
        <Box paddingLeft={2}>
          <ProgressBar percent={pct} />
        </Box>
      )}
    </Box>
  );
};
