/**
 * TaskList — displays background tasks with status indicators.
 *
 * Shows running, completed, and failed tasks in a compact
 * list format, similar to VS Code's task list view.
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Types ──────────────────────────────────────────────

export interface TaskInfo {
  /** Unique task ID */
  id: string;
  /** Task description */
  label: string;
  /** Task status */
  status: 'running' | 'completed' | 'failed' | 'pending';
  /** Optional progress percentage (0-100) */
  progress?: number;
}

export interface TaskListProps {
  /** Tasks to display */
  tasks: TaskInfo[];
  /** Maximum tasks to show */
  maxVisible?: number;
}

// ── Status indicators ──────────────────────────────────

const STATUS_INDICATORS: Record<TaskInfo['status'], { icon: string; color: string }> = {
  running:   { icon: '⠋', color: 'cyan' },
  completed: { icon: '✓', color: 'green' },
  failed:    { icon: '✗', color: 'red' },
  pending:   { icon: '○', color: 'gray' },
};

// ── Component ──────────────────────────────────────────

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  maxVisible = 5,
}) => {
  if (tasks.length === 0) return null;

  const visibleTasks = tasks.slice(0, maxVisible);

  return (
    <Box flexDirection="column">
      {visibleTasks.map((task) => {
        const indicator = STATUS_INDICATORS[task.status];

        return (
          <Box key={task.id} flexDirection="row" gap={1}>
            <Text color={indicator.color}>{indicator.icon}</Text>
            <Text
              color={task.status === 'failed' ? 'red' : task.status === 'completed' ? 'green' : undefined}
              dimColor={task.status === 'pending'}
            >
              {task.label}
            </Text>
            {task.progress !== undefined && task.status === 'running' && (
              <Text dimColor>{task.progress}%</Text>
            )}
          </Box>
        );
      })}

      {tasks.length > maxVisible && (
        <Box>
          <Text dimColor>  + {tasks.length - maxVisible} more tasks</Text>
        </Box>
      )}
    </Box>
  );
};