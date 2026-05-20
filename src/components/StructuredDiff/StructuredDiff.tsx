/**
 * StructuredDiff — diff display component with colored
 * add/delete lines and line numbers.
 *
 * Renders file edit diffs with:
 * - Added lines in green
 * - Deleted lines in red
 * - Line numbers on both sides
 * - File name header
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Types ──────────────────────────────────────────────

export interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface StructuredDiffProps {
  /** File name being edited */
  fileName?: string;
  /** Diff lines to display */
  lines: DiffLine[];
  /** Maximum lines to show (default: 20) */
  maxLines?: number;
}

// ── Component ──────────────────────────────────────────

export const StructuredDiff: React.FC<StructuredDiffProps> = ({
  fileName,
  lines,
  maxLines = 20,
}) => {
  const visibleLines = lines.slice(0, maxLines);

  return (
    <Box flexDirection="column">
      {/* File header */}
      {fileName && (
        <Box paddingBottom={1}>
          <Text bold color="cyan">📄 {fileName}</Text>
        </Box>
      )}

      {/* Diff lines */}
      {visibleLines.map((line, i) => {
        if (line.type === 'header') {
          return (
            <Box key={i}>
              <Text color="cyan" bold>{line.content}</Text>
            </Box>
          );
        }

        const lineNoWidth = 4;
        const oldNo = line.oldLineNo?.toString().padStart(lineNoWidth) ?? '    ';
        const newNo = line.newLineNo?.toString().padStart(lineNoWidth) ?? '    ';

        return (
          <Box key={i} flexDirection="row">
            {/* Line numbers */}
            <Text dimColor>{oldNo} </Text>
            <Text dimColor>{newNo} </Text>

            {/* Change indicator */}
            {line.type === 'add' && (
              <Text color="green" backgroundColor="">+ {line.content}</Text>
            )}
            {line.type === 'delete' && (
              <Text color="red">- {line.content}</Text>
            )}
            {line.type === 'context' && (
              <Text dimColor>  {line.content}</Text>
            )}
          </Box>
        );
      })}

      {/* Truncation indicator */}
      {lines.length > maxLines && (
        <Box paddingTop={1}>
          <Text dimColor>  ▼ {lines.length - maxLines} more lines</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Create a simple diff from old and new text.
 * Lines that exist in new but not in old are "add".
 * Lines that exist in old but not in new are "delete".
 * Lines that exist in both are "context".
 */
export function createSimpleDiff(
  fileName: string,
  oldText: string,
  newText: string,
): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const result: DiffLine[] = [
    { type: 'header', content: `--- ${fileName} (original)` },
    { type: 'header', content: `+++ ${fileName} (modified)` },
  ];

  // Simple line-by-line comparison (not a real diff algorithm)
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === undefined && newLine !== undefined) {
      result.push({ type: 'add', content: newLine, newLineNo: i + 1 });
    } else if (oldLine !== undefined && newLine === undefined) {
      result.push({ type: 'delete', content: oldLine, oldLineNo: i + 1 });
    } else if (oldLine !== undefined && newLine !== undefined) {
      if (oldLine === newLine) {
        result.push({ type: 'context', content: oldLine, oldLineNo: i + 1, newLineNo: i + 1 });
      } else {
        result.push({ type: 'delete', content: oldLine, oldLineNo: i + 1 });
        result.push({ type: 'add', content: newLine, newLineNo: i + 1 });
      }
    }
  }

  return result;
}