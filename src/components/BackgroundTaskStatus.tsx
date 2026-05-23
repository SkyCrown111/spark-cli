/**
 * BackgroundTaskStatus — displays running background tasks in the REPL.
 *
 * Shows a compact list of background tasks with their status,
 * command name, and duration. Rendered in the footer area.
 *
 * Mirrors Claude Code's background task display.
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Types ──────────────────────────────────────────────

export interface BackgroundTask {
  id: string;
  name: string;
  status: string;
}

export interface BackgroundTaskStatusProps {
  /** List of background tasks */
  tasks: BackgroundTask[];
}

// ── Component ──────────────────────────────────────────

/**
 * BackgroundTaskStatus — shows running background tasks.
 *
 * Renders a compact row for each task with status indicator.
 * Only visible when there are active background tasks.
 */
export const BackgroundTaskStatus: React.FC<BackgroundTaskStatusProps> = ({ tasks }) => {
  if (tasks.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>Background tasks:</Text>
      {tasks.map((task) => {
        const statusIcon =
          task.status === 'running'
            ? '●'
            : task.status === 'exited'
              ? '○'
              : task.status === 'error'
                ? '✗'
                : '○';
        const statusColor =
          task.status === 'running' ? 'green' : task.status === 'error' ? 'red' : 'gray';

        return (
          <Box key={task.id} gap={1}>
            <Text color={statusColor}>{statusIcon}</Text>
            <Text dimColor wrap="truncate">
              {task.name.length > 40 ? task.name.slice(0, 37) + '...' : task.name}
            </Text>
            <Text dimColor>({task.status})</Text>
          </Box>
        );
      })}
    </Box>
  );
};
