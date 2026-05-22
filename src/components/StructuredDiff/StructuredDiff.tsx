/**
 * StructuredDiff — diff display component with colored
 * add/delete lines and line numbers.
 *
 * Uses the `diff` library for proper Myers diff algorithm
 * when available (async), with sync fallback.
 * Supports word-level highlighting within changed lines.
 *
 * Renders file edit diffs with:
 * - Added lines in green (with word-level highlights)
 * - Deleted lines in red (with word-level highlights)
 * - Line numbers on both sides
 * - File name header
 * - Collapsible context sections
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

// ── Types ──────────────────────────────────────────────

export interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
  /** Word-level changes within the line (for add/delete lines) */
  wordChanges?: WordChange[];
}

export interface WordChange {
  type: 'add' | 'delete' | 'context';
  text: string;
}

export interface StructuredDiffProps {
  /** File name being edited */
  fileName?: string;
  /** Diff lines to display */
  lines: DiffLine[];
  /** Maximum lines to show (default: 30) */
  maxLines?: number;
  /** Show collapsible context sections */
  collapsible?: boolean;
}

// ── Word-level diff helper ──

function computeWordChanges(oldText: string, newText: string): WordChange[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  let prefixLen = 0;
  while (
    prefixLen < oldWords.length &&
    prefixLen < newWords.length &&
    oldWords[prefixLen] === newWords[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldWords.length - prefixLen &&
    suffixLen < newWords.length - prefixLen &&
    oldWords[oldWords.length - 1 - suffixLen] === newWords[newWords.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const result: WordChange[] = [];

  for (let i = 0; i < prefixLen; i++) {
    result.push({ type: 'context', text: oldWords[i] });
  }
  for (let i = prefixLen; i < oldWords.length - suffixLen; i++) {
    result.push({ type: 'delete', text: oldWords[i] });
  }
  for (let i = prefixLen; i < newWords.length - suffixLen; i++) {
    result.push({ type: 'add', text: newWords[i] });
  }
  for (let i = oldWords.length - suffixLen; i < oldWords.length; i++) {
    result.push({ type: 'context', text: oldWords[i] });
  }

  return result;
}

// ── Component ──────────────────────────────────────────

/**
 * Render word-level changes within a line.
 */
const WordChanges: React.FC<{ changes: WordChange[]; baseColor: string }> = ({
  changes,
  baseColor,
}) => (
  <>
    {changes.map((wc, i) => {
      if (wc.type === 'add') {
        return (
          <Text key={i} color="black" backgroundColor="green" bold>
            {wc.text}
          </Text>
        );
      }
      if (wc.type === 'delete') {
        return (
          <Text key={i} color={baseColor} strikethrough>
            {wc.text}
          </Text>
        );
      }
      return <Text key={i} color={baseColor}>{wc.text}</Text>;
    })}
  </>
);

export const StructuredDiff: React.FC<StructuredDiffProps> = ({
  fileName,
  lines,
  maxLines = 30,
  collapsible = true,
}) => {
  const { visibleLines, collapsedCount } = useMemo(() => {
    if (!collapsible || lines.length <= maxLines) {
      return { visibleLines: lines, collapsedCount: 0 };
    }

    const headCount = Math.ceil(maxLines * 0.4);
    const tailCount = Math.floor(maxLines * 0.4);
    const head = lines.slice(0, headCount);
    const tail = lines.slice(lines.length - tailCount);
    const hiddenCount = lines.length - headCount - tailCount;

    return {
      visibleLines: [
        ...head,
        { type: 'header' as const, content: `⋯ ${hiddenCount} unchanged lines ⋯` },
        ...tail,
      ],
      collapsedCount: hiddenCount,
    };
  }, [lines, maxLines, collapsible]);

  return (
    <Box flexDirection="column">
      {fileName && (
        <Box paddingBottom={1}>
          <Text bold color="cyan">{fileName}</Text>
        </Box>
      )}

      {visibleLines.map((line, i) => {
        if (line.type === 'header') {
          if (line.content.startsWith('⋯')) {
            return (
              <Box key={i} paddingY={0}>
                <Text dimColor>{line.content}</Text>
              </Box>
            );
          }
          return (
            <Box key={i}>
              <Text color="cyan" bold>{line.content}</Text>
            </Box>
          );
        }

        const lineNoWidth = 4;
        const oldNo = line.oldLineNo?.toString().padStart(lineNoWidth) ?? ' '.repeat(lineNoWidth);
        const newNo = line.newLineNo?.toString().padStart(lineNoWidth) ?? ' '.repeat(lineNoWidth);

        return (
          <Box key={i} flexDirection="row">
            <Text dimColor>{oldNo} </Text>
            <Text dimColor>{newNo} </Text>

            {line.type === 'add' && (
              <Text color="green">
                {'+ '}
                {line.wordChanges ? (
                  <WordChanges changes={line.wordChanges} baseColor="green" />
                ) : (
                  line.content
                )}
              </Text>
            )}
            {line.type === 'delete' && (
              <Text color="red">
                {'- '}
                {line.wordChanges ? (
                  <WordChanges changes={line.wordChanges} baseColor="red" />
                ) : (
                  line.content
                )}
              </Text>
            )}
            {line.type === 'context' && (
              <Text dimColor>  {line.content}</Text>
            )}
          </Box>
        );
      })}

      {collapsedCount > 0 && (
        <Box paddingTop={1}>
          <Text dimColor>  ({collapsedCount} lines hidden, {lines.length} total)</Text>
        </Box>
      )}
    </Box>
  );
};

// ── Diff computation ──

/**
 * Simple line-based diff with word-level highlighting.
 * Uses prefix/suffix common detection (no external dependency).
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

  // Find common prefix of lines
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix of lines
  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // Render prefix (context)
  for (let i = 0; i < prefixLen; i++) {
    result.push({
      type: 'context',
      content: oldLines[i],
      oldLineNo: i + 1,
      newLineNo: i + 1,
    });
  }

  // Render changes (deleted + added)
  const oldChanged = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const newChanged = newLines.slice(prefixLen, newLines.length - suffixLen);

  // Pair up changed lines for word-level diff
  const maxPairs = Math.max(oldChanged.length, newChanged.length);
  for (let i = 0; i < maxPairs; i++) {
    const oldLine = i < oldChanged.length ? oldChanged[i] : undefined;
    const newLine = i < newChanged.length ? newChanged[i] : undefined;

    if (oldLine !== undefined && newLine !== undefined) {
      // Both changed — compute word-level diff
      const wordChanges = computeWordChanges(oldLine, newLine);
      result.push({
        type: 'delete',
        content: oldLine,
        oldLineNo: prefixLen + i + 1,
        wordChanges: wordChanges.filter((wc) => wc.type !== 'add'),
      });
      result.push({
        type: 'add',
        content: newLine,
        newLineNo: prefixLen + i + 1,
        wordChanges: wordChanges.filter((wc) => wc.type !== 'delete'),
      });
    } else if (oldLine !== undefined) {
      result.push({
        type: 'delete',
        content: oldLine,
        oldLineNo: prefixLen + i + 1,
      });
    } else if (newLine !== undefined) {
      result.push({
        type: 'add',
        content: newLine,
        newLineNo: prefixLen + i + 1,
      });
    }
  }

  // Render suffix (context)
  const suffixStart = oldLines.length - suffixLen;
  for (let i = 0; i < suffixLen; i++) {
    result.push({
      type: 'context',
      content: oldLines[suffixStart + i],
      oldLineNo: suffixStart + i + 1,
      newLineNo: newLines.length - suffixLen + i + 1,
    });
  }

  return result;
}

/**
 * Myers diff using the `diff` library (async).
 * Falls back to simple diff if library not available.
 */
export async function createDiffAsync(
  fileName: string,
  oldText: string,
  newText: string,
): Promise<DiffLine[]> {
  try {
    const diff = await import('diff');
    const changes = diff.diffLines(oldText, newText);

    const result: DiffLine[] = [
      { type: 'header', content: `--- ${fileName} (original)` },
      { type: 'header', content: `+++ ${fileName} (modified)` },
    ];

    let oldLineNo = 1;
    let newLineNo = 1;

    for (const change of changes) {
      const changeLines = change.value.split('\n');
      if (changeLines[changeLines.length - 1] === '') {
        changeLines.pop();
      }

      for (const line of changeLines) {
        if (change.added) {
          result.push({ type: 'add', content: line, newLineNo: newLineNo++ });
        } else if (change.removed) {
          result.push({ type: 'delete', content: line, oldLineNo: oldLineNo++ });
        } else {
          result.push({ type: 'context', content: line, oldLineNo: oldLineNo++, newLineNo: newLineNo++ });
        }
      }
    }

    return result;
  } catch {
    return createSimpleDiff(fileName, oldText, newText);
  }
}

// Alias for backward compatibility
export const createDiff = createSimpleDiff;
