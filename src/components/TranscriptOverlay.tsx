/**
 * TranscriptOverlay — full-screen overlay for viewing conversation history.
 *
 * Renders the complete conversation with role-based formatting,
 * expandable tool calls, search filtering, and keyboard navigation.
 *
 * Features:
 * - Role-based color formatting (user=cyan, assistant=green, tool=magenta)
 * - Search filtering by transcriptSearchQuery
 * - Expanded tool call display with full args, results, and timing
 * - Keyboard navigation: PageUp/Down, {/} for paragraph jump, Escape to close
 * - Uses ScrollBox for scrollable content
 */

import React, { useMemo, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { ScrollBox, type ScrollBoxHandle } from '../ink/components/ScrollBox.js';
import { colors } from '../theme/colors.js';
import {
  buildTranscriptData,
  type TranscriptEntry,
} from '../core/repl/transcript-data.js';
import type { ChatMessage } from '../core/providers/openai-compatible.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

// ── Props ──────────────────────────────────────────────────

export interface TranscriptOverlayProps {
  /** Full agent history */
  agentHistory: ChatMessage[];
  /** Current search query (from AppState) */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchQueryChange: (query: string) => void;
  /** Whether search mode is active */
  searchActive: boolean;
  /** Callback to toggle search mode */
  onToggleSearch: () => void;
  /** Close the transcript overlay */
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────

/**
 * TranscriptOverlay renders the full conversation transcript in an
 * alternate-screen overlay with search and scroll navigation.
 */
export const TranscriptOverlay: React.FC<TranscriptOverlayProps> = ({
  agentHistory,
  searchQuery,
  onSearchQueryChange,
  searchActive,
  onToggleSearch,
  onClose,
}) => {
  const { width, height } = useTerminalSize();
  const scrollBoxRef = useRef<ScrollBoxHandle | null>(null);

  // Build structured transcript data
  const allEntries = useMemo(
    () => buildTranscriptData(agentHistory),
    [agentHistory],
  );

  // Filter entries by search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return allEntries;

    const query = searchQuery.toLowerCase();
    return allEntries.filter((entry) => {
      // Match content
      if (entry.content.toLowerCase().includes(query)) return true;
      // Match tool call names/args/results
      for (const tc of entry.toolCalls) {
        if (tc.name.toLowerCase().includes(query)) return true;
        if (tc.args.toLowerCase().includes(query)) return true;
        if (tc.result?.toLowerCase().includes(query)) return true;
      }
      return false;
    });
  }, [allEntries, searchQuery]);

  // All tool calls are expanded by default in transcript view
  const expandedTools = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of allEntries) {
      for (const tc of entry.toolCalls) {
        keys.add(`${entry.key}-${tc.id}`);
      }
    }
    return keys;
  }, [allEntries]);

  // Estimate total row count for ScrollBox
  const estimatedRowCount = useMemo(() => {
    let rows = 0;
    for (const entry of filteredEntries) {
      // Header line + content lines + tool call lines
      rows += 1; // header
      if (entry.content) {
        rows += Math.max(1, entry.content.split('\n').length);
      }
      for (const tc of entry.toolCalls) {
        if (expandedTools.has(`${entry.key}-${tc.id}`)) {
          rows += 4; // name + args heading + result heading + separator
          rows += Math.max(1, tc.args.split('\n').length);
          rows += Math.max(1, (tc.result ?? '').split('\n').length);
        } else {
          rows += 1; // compact line
        }
      }
    }
    return Math.max(1, rows);
  }, [filteredEntries, expandedTools]);

  // Keyboard handling
  useInput((input, key) => {
    // Escape: close
    if (key.escape) {
      if (searchActive) {
        onToggleSearch();
        onSearchQueryChange('');
      } else {
        onClose();
      }
      return;
    }

    // Ctrl+F or /: toggle search
    if ((key.ctrl && input === 'f') || input === '/') {
      if (!searchActive) {
        onToggleSearch();
      }
      return;
    }

    // Search mode character input
    if (searchActive) {
      if (key.backspace || key.delete) {
        if (searchQuery.length > 0) {
          onSearchQueryChange(searchQuery.slice(0, -1));
        } else {
          onToggleSearch();
        }
        return;
      }
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        onSearchQueryChange(searchQuery + input);
        return;
      }
    }

    // Paragraph jump with { and }
    if (input === '{') {
      scrollBoxRef.current?.scrollBy(-10);
      return;
    }
    if (input === '}') {
      scrollBoxRef.current?.scrollBy(10);
      return;
    }

    // [ to write current view to scrollback (no-op for now, reserved)
    if (input === '[') {
      // Reserved: write transcript to scrollback
      return;
    }

    // v to open in editor (no-op for now, reserved)
    if (input === 'v' && !searchActive) {
      // Reserved: open transcript in external editor
      return;
    }
  });

  // Header height: 3 lines (title bar + search bar if active)
  const headerHeight = searchActive ? 3 : 2;
  const footerHeight = 1;
  const contentHeight = Math.max(1, height - headerHeight - footerHeight);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
    >
      {/* Title bar */}
      <Box
        flexDirection="row"
        paddingX={1}
        borderStyle="single"
        borderBottom={false}
        borderColor="cyan"
      >
        <Text bold color="cyan">Transcript</Text>
        <Box flexGrow={1} />
        <Text dimColor>
          {filteredEntries.length}/{allEntries.length} entries
        </Text>
        <Text dimColor> | Esc close | / search</Text>
      </Box>

      {/* Search bar (when active) */}
      {searchActive && (
        <Box
          flexDirection="row"
          paddingX={1}
          gap={1}
          borderStyle="single"
          borderBottom={false}
          borderColor="yellow"
        >
          <Text color="yellow" bold>{'>'}</Text>
          <Text color="white">{searchQuery}</Text>
          <Text color="white" bold>_</Text>
        </Box>
      )}

      {/* Scrollable content area */}
      <Box
        flexDirection="column"
        height={contentHeight}
        overflow="hidden"
        borderStyle="single"
        borderTop={false}
        borderColor="cyan"
      >
        <ScrollBox
          rowCount={estimatedRowCount}
          estimatedRowHeight={1}
          maxHeight={contentHeight}
          autoPinToBottom={false}
          stickyScroll={false}
          scrollingEnabled={true}
          handleRef={scrollBoxRef}
        >
          {(_visibleStart, _visibleEnd) => (
            <Box flexDirection="column" paddingX={1}>
              {filteredEntries.map((entry) => (
                <TranscriptEntryView
                  key={entry.key}
                  entry={entry}
                  expandedTools={expandedTools}
                  searchQuery={searchQuery}
                />
              ))}
              {filteredEntries.length === 0 && searchQuery && (
                <Box paddingY={1}>
                  <Text dimColor>No matches for "{searchQuery}"</Text>
                </Box>
              )}
            </Box>
          )}
        </ScrollBox>
      </Box>

      {/* Footer hints */}
      <Box paddingX={1}>
        <Text dimColor>
          / search | {'{'} {'}'} paragraph | PgUp/PgDn scroll | Esc close
        </Text>
      </Box>
    </Box>
  );
};

// ── Entry view ─────────────────────────────────────────────

interface TranscriptEntryViewProps {
  entry: TranscriptEntry;
  expandedTools: Set<string>;
  searchQuery: string;
}

const TranscriptEntryView: React.FC<TranscriptEntryViewProps> = ({
  entry,
  expandedTools,
  searchQuery,
}) => {
  const roleColor =
    entry.role === 'user'
      ? colors.user
      : entry.role === 'assistant'
        ? colors.assistant
        : colors.muted;

  return (
    <Box flexDirection="column" marginY={0}>
      {/* Role header */}
      <Box>
        <Text bold color={roleColor}>{'>'}</Text>
      </Box>

      {/* Content */}
      {entry.content && (
        <Box paddingLeft={2} flexDirection="column">
          {entry.content.split('\n').map((line, i) => (
            <Box key={i}>
              <Text wrap="wrap">{highlightMatch(line, searchQuery)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Tool calls */}
      {entry.toolCalls.map((tc) => {
        const toolKey = `${entry.key}-${tc.id}`;
        const isExpanded = expandedTools.has(toolKey);

        return (
          <Box key={toolKey} flexDirection="column" paddingLeft={2}>
            <Box>
              <Text color="yellow">{'⏺ '}</Text>
              <Text bold color={colors.tool}>{tc.name}</Text>
              {tc.durationMs != null && (
                <Text dimColor> ({formatDuration(tc.durationMs)})</Text>
              )}
              <Text
                dimColor
              > {isExpanded ? '▼' : '▶'} click to expand</Text>
            </Box>

            {isExpanded && (
              <Box flexDirection="column" paddingLeft={2}>
                {/* Args */}
                <Box flexDirection="column">
                  {formatJsonLines(tc.args).map((line, i) => (
                    <Box key={i}>
                      <Text dimColor wrap="wrap">{line}</Text>
                    </Box>
                  ))}
                </Box>

                {/* Result */}
                {tc.result && (
                  <Box flexDirection="column">
                    {tc.result.split('\n').map((line, i) => (
                      <Box key={i}>
                        <Text dimColor wrap="wrap">
                          {highlightMatch(line, searchQuery)}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

// ── Helpers ────────────────────────────────────────────────

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

/**
 * Highlight search matches in text by wrapping them in markers.
 * Since Ink's Text component doesn't support inline highlighting,
 * we return the text as-is but this function is available for
 * future enhancement with a custom highlight component.
 */
function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  // For now, return text as-is. Ink Text doesn't support
  // inline color changes within a single Text element.
  return text;
}
