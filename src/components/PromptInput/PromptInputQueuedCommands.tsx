/**
 * PromptInputQueuedCommands — displays the command queue status.
 *
 * When the command queue has pending commands, this component
 * shows a compact status line:
 *   ⏳ 3 queued: first command text...
 *
 * Mirrors cc-haha's command queue visualization.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { QueuedCommand } from '../../hooks/useCommandQueue.js';

// ── Props ──────────────────────────────────────────────

// ── Props ──────────────────────────────────────────────

export interface PromptInputQueuedCommandsProps {
  /** Number of pending commands */
  pendingCount: number;
  /** The next command to be processed */
  currentCommand: QueuedCommand | null;
}

// ── Component ──────────────────────────────────────────

export const PromptInputQueuedCommands: React.FC<PromptInputQueuedCommandsProps> = ({
  pendingCount,
  currentCommand,
}) => {
  if (pendingCount === 0) return null;

  // Show next command preview (truncated)
  const nextText = currentCommand?.text ?? '';
  const preview = nextText.length > 40 ? nextText.slice(0, 37) + '...' : nextText;

  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text color="yellow">{'>'}</Text>
      <Text color="yellow" bold>{pendingCount}</Text>
      <Text dimColor>queued:</Text>
      {preview && <Text dimColor>{preview}</Text>}
    </Box>
  );
};
