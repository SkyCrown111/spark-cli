/**
 * FileEditToolDiff — specialized diff renderer for file edit tool results.
 *
 * Unlike the generic StructuredDiff which works on unified diff format,
 * this component parses the oldText/newText pattern used by
 * write_file and edit_file tools, generating a precise inline diff
 * with file name, line numbers, and colored additions/deletions.
 *
 * Mirrors cc-haha's FileEditToolDiff component.
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { StructuredDiff, createSimpleDiff } from './StructuredDiff/StructuredDiff.js';

// ── Props ──────────────────────────────────────────────

export interface FileEditToolDiffProps {
  /** File path being edited */
  filePath: string;
  /** Old text content */
  oldText: string;
  /** New text content */
  newText: string;
  /** Starting line number (default: 1) */
  startLine?: number;
  /** Maximum diff lines to display (default: 30) */
  maxLines?: number;
}

// ── Component ──────────────────────────────────────────

/**
 * FileEditToolDiff — renders a precise file edit diff.
 *
 * Uses createSimpleDiff which includes word-level highlighting
 * for changed line pairs. Displays:
 * - File path header with +/- summary
 * - StructuredDiff with word-level highlights
 * - Line numbers for context
 */
export const FileEditToolDiff: React.FC<FileEditToolDiffProps> = ({
  filePath,
  oldText,
  newText,
  startLine: _startLine = 1,
  maxLines = 30,
}) => {
  const diffLines = useMemo(() => {
    return createSimpleDiff(filePath, oldText, newText);
  }, [filePath, oldText, newText]);

  const additions = diffLines.filter((l) => l.type === 'add').length;
  const deletions = diffLines.filter((l) => l.type === 'delete').length;

  return (
    <Box flexDirection="column">
      {/* File header */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="cyan">
          {'⏺'}
        </Text>
        <Text bold>{filePath}</Text>
        <Text dimColor>
          (+{additions} -{deletions})
        </Text>
      </Box>

      {/* Diff content with word-level highlighting */}
      <Box paddingLeft={2}>
        <StructuredDiff lines={diffLines} maxLines={maxLines} />
      </Box>
    </Box>
  );
};
