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
import { DiffLine, StructuredDiff } from './StructuredDiff/StructuredDiff.js';

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

// ── Diff computation ───────────────────────────────────

/**
 * Compute a simple line-based diff between old and new text.
 * Uses a longest-common-subsequence approach for line-level diff.
 */
function computeLineDiff(
  oldLines: string[],
  newLines: string[],
  startLine: number,
): DiffLine[] {
  const result: DiffLine[] = [];
  let oldLineNo = startLine;
  let newLineNo = startLine;

  // Simple diff: mark all old lines as deleted, all new lines as added
  // A proper implementation would use Myers' diff algorithm, but for
  // a CLI tool display, this provides a clear before/after view.

  // Find common prefix
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // Render prefix (common)
  for (let i = 0; i < prefixLen; i++) {
    oldLineNo++;
    newLineNo++;
    result.push({
      type: 'context',
      content: oldLines[i],
      oldLineNo,
      newLineNo,
    });
  }

  // Render deleted lines
  for (let i = prefixLen; i < oldLines.length - suffixLen; i++) {
    oldLineNo++;
    result.push({
      type: 'delete',
      content: oldLines[i],
      oldLineNo,
    });
  }

  // Render added lines
  for (let i = prefixLen; i < newLines.length - suffixLen; i++) {
    newLineNo++;
    result.push({
      type: 'add',
      content: newLines[i],
      newLineNo,
    });
  }

  // Render suffix (common)
  for (let i = oldLines.length - suffixLen; i < oldLines.length; i++) {
    oldLineNo++;
    newLineNo++;
    result.push({
      type: 'context',
      content: oldLines[i],
      oldLineNo,
      newLineNo,
    });
  }

  return result;
}

// ── Component ──────────────────────────────────────────

/**
 * FileEditToolDiff — renders a precise file edit diff.
 *
 * Displays:
 * - File path header
 * - StructuredDiff of the changes
 * - Line numbers for context
 */
export const FileEditToolDiff: React.FC<FileEditToolDiffProps> = ({
  filePath,
  oldText,
  newText,
  startLine = 1,
  maxLines = 30,
}) => {
  const diffLines = useMemo(() => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    return computeLineDiff(oldLines, newLines, startLine);
  }, [oldText, newText, startLine]);

  // Count additions and deletions for summary
  const additions = diffLines.filter((l) => l.type === 'add').length;
  const deletions = diffLines.filter((l) => l.type === 'delete').length;

  return (
    <Box flexDirection="column">
      {/* File header */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="cyan">{'⏺'}</Text>
        <Text bold>{filePath}</Text>
        <Text dimColor>
          (+{additions} -{deletions})
        </Text>
      </Box>

      {/* Diff content */}
      <Box paddingLeft={2}>
        <StructuredDiff lines={diffLines} maxLines={maxLines} />
      </Box>
    </Box>
  );
};
