/**
 * UserToolSuccessMessage — renders a successful tool result.
 *
 * Shows the tool label and result content, with auto-collapse
 * for long outputs and diff detection for code changes.
 */

import React, { useMemo } from 'react';
import { Box } from '../../design-system/Box.js';
import { Text } from '../../design-system/Text.js';
import { colors } from '../../../theme/colors.js';
import { collapseToolResult } from '../../../utils/collapseToolResults.js';
import { StructuredDiff, type DiffLine } from '../../StructuredDiff/StructuredDiff.js';

export interface UserToolSuccessMessageProps {
  toolLabel: string;
  content: string;
  expanded?: boolean;
}

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
  return diffMarkers > 0 && diffMarkers / lines.length > 0.3;
}

function parseDiffContent(content: string): DiffLine[] {
  const lines = content.split('\n');
  const result: DiffLine[] = [];
  let oldLineNo = 0;
  let newLineNo = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
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
      result.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNo,
        newLineNo,
      });
    }
  }
  return result;
}

export const UserToolSuccessMessage: React.FC<UserToolSuccessMessageProps> = ({
  toolLabel,
  content,
  expanded = false,
}) => {
  const isDiff = useMemo(() => isDiffContent(content), [content]);
  const collapseResult = useMemo(() => {
    if (expanded) {
      return {
        collapsed: false,
        visibleLines: content.split('\n'),
        hiddenCount: 0,
        totalCount: content.split('\n').length,
      };
    }
    return collapseToolResult(content);
  }, [content, expanded]);

  const diffLines = useMemo(() => {
    if (isDiff) return parseDiffContent(content);
    return undefined;
  }, [content, isDiff]);

  if (isDiff && diffLines) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={colors.tool}>
            ✓ {toolLabel}
          </Text>
          <Text dimColor> — diff</Text>
        </Box>
        <Box paddingLeft={2}>
          <StructuredDiff lines={diffLines} maxLines={20} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="green">
          ✓ {toolLabel}
        </Text>
        {collapseResult.collapsed && <Text dimColor> ({collapseResult.totalCount} lines)</Text>}
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {collapseResult.visibleLines.map((line, i) => {
          if (line.includes('lines collapsed')) {
            return (
              <Box key={i}>
                <Text color="yellow" bold>
                  {line}
                </Text>
              </Box>
            );
          }
          return (
            <Box key={i}>
              <Text dimColor wrap="wrap">
                {line}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
