/**
 * ToolMessage component - Displays tool call results.
 *
 * After Phase 16-H: integrates collapseToolResults for long
 * outputs and StructuredDiff for code diff content.
 *
 * Features:
 * - Long outputs (>15 lines) auto-collapse with summary
 * - Diff-like content detected and rendered with StructuredDiff
 * - Tool name display from tool_call_id correlation
 * - Compact display for background bash commands
 */

import React, { useMemo } from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { colors } from '../../theme/colors.js';
import { collapseToolResult } from '../../utils/collapseToolResults.js';
import { StructuredDiff, type DiffLine } from '../StructuredDiff/StructuredDiff.js';
import type { ToolMessage as ToolMessageType } from '../../core/providers/openai-compatible.js';

export interface ToolMessageProps {
  message: ToolMessageType;
  /** Whether to show expanded (override collapse) */
  expanded?: boolean;
  /** Tool arguments JSON string (for expanded transcript view) */
  toolArgs?: string;
  /** Tool execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Detect if content looks like a unified diff.
 * Checks for lines starting with +, -, @@, ---, +++.
 */
function isDiffContent(content: string): boolean {
  const lines = content.split('\n');
  let diffMarkers = 0;
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      diffMarkers++;
    } else if (line.startsWith('+') || line.startsWith('-')) {
      diffMarkers++;
    }
  }
  // If more than 30% of lines look like diff markers, treat as diff
  return diffMarkers > 0 && diffMarkers / lines.length > 0.3;
}

/**
 * Parse diff content into DiffLine array for StructuredDiff.
 */
function parseDiffContent(content: string): DiffLine[] {
  const lines = content.split('\n');
  const result: DiffLine[] = [];

  let oldLineNo = 0;
  let newLineNo = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse hunk header for line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNo = parseInt(match[1], 10) - 1;
        newLineNo = parseInt(match[2], 10) - 1;
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      newLineNo++;
      result.push({ type: 'add', content: line.slice(1), newLineNo });
    } else if (line.startsWith('-')) {
      oldLineNo++;
      result.push({ type: 'delete', content: line.slice(1), oldLineNo });
    } else {
      oldLineNo++;
      newLineNo++;
      result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldLineNo, newLineNo });
    }
  }

  return result;
}

/**
 * ToolMessage component for displaying tool execution results.
 *
 * @example
 * ```tsx
 * <ToolMessage message={{ role: 'tool', content: 'Result data', tool_call_id: '123' }} />
 * ```
 */
export const ToolMessage: React.FC<ToolMessageProps> = ({
  message,
  expanded = false,
  toolArgs,
  durationMs,
}) => {
  const content = message.content;

  // Check if this looks like a diff
  const isDiff = useMemo(() => isDiffContent(content), [content]);

  // Collapse long content (unless expanded)
  const collapseResult = useMemo(() => {
    if (expanded) {
      return { collapsed: false, visibleLines: content.split('\n'), hiddenCount: 0, totalCount: content.split('\n').length };
    }
    return collapseToolResult(content);
  }, [content, expanded]);

  // Parse diff lines if applicable
  const diffLines = useMemo(() => {
    if (isDiff) return parseDiffContent(content);
    return undefined;
  }, [content, isDiff]);

  // Extract a readable tool name from tool_call_id
  // Format is typically "call_XXXX" or a custom ID
  const toolLabel = message.tool_call_id
    ? message.tool_call_id.startsWith('call_')
      ? 'Tool'
      : message.tool_call_id
    : 'Tool';

  // If it's diff content, render with StructuredDiff
  if (isDiff && diffLines) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={colors.tool}>{'⏺'} {toolLabel}</Text>
          <Text dimColor> — diff</Text>
          {durationMs != null && (
            <Text dimColor> ({formatDuration(durationMs)})</Text>
          )}
        </Box>
        <Box>
          <StructuredDiff lines={diffLines} maxLines={20} />
        </Box>
      </Box>
    );
  }

  // Expanded mode: show full args, result, and timing
  if (expanded && toolArgs) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={colors.tool}>{'⏺'} {toolLabel}</Text>
          {durationMs != null && (
            <Text dimColor> ({formatDuration(durationMs)})</Text>
          )}
        </Box>
        {/* Tool arguments */}
        <Box paddingLeft={2} flexDirection="column">
          {formatJsonLines(toolArgs).map((line, i) => (
            <Box key={i}>
              <Text dimColor wrap="wrap">{line}</Text>
            </Box>
          ))}
        </Box>
        {/* Tool result */}
        <Box paddingLeft={2} flexDirection="column">
          {collapseResult.visibleLines.map((line, i) => {
            if (line.includes('lines collapsed')) {
              return (
                <Box key={i}>
                  <Text color="yellow" bold>{line}</Text>
                </Box>
              );
            }
            return (
              <Box key={i}>
                <Text dimColor wrap="wrap">{line}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // Standard collapsed/expanded display
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={colors.tool}>{'⏺'} {toolLabel}</Text>
        {collapseResult.collapsed && (
          <Text dimColor> ({collapseResult.totalCount} lines)</Text>
        )}
        {durationMs != null && (
          <Text dimColor> ({formatDuration(durationMs)})</Text>
        )}
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {collapseResult.visibleLines.map((line, i) => {
          // Check if this is the collapse indicator line
          if (line.includes('lines collapsed')) {
            return (
              <Box key={i}>
                <Text color="yellow" bold>{line}</Text>
              </Box>
            );
          }
          return (
            <Box key={i}>
              <Text dimColor wrap="wrap">{line}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m${sec}s`;
}

/**
 * Parse a JSON string into formatted lines for display.
 * Returns an indented, pretty-printed array of lines.
 */
function formatJsonLines(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    const pretty = JSON.stringify(parsed, null, 2);
    return pretty.split('\n');
  } catch {
    return [json];
  }
}
