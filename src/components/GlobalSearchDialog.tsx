/**
 * GlobalSearchDialog — full-text search across all messages.
 *
 * Renders a search bar overlay at the top of the REPL that
 * allows the user to search through the conversation history.
 *
 * Features:
 * - Real-time search as you type
 * - n/N navigation between matches
 * - Highlighted matches in messages
 * - Escape to dismiss
 * - Match counter (3/12)
 *
 * Mirrors cc-haha's GlobalSearchDialog.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

// ── Props ──────────────────────────────────────────────

export interface GlobalSearchDialogProps {
  /** Current search query */
  query: string;
  /** Callback when query changes */
  onQueryChange: (query: string) => void;
  /** Total number of matches */
  matchCount: number;
  /** Current match index (0-based) */
  focusIndex: number;
  /** Navigate to the next match */
  onNextMatch: () => void;
  /** Navigate to the previous match */
  onPrevMatch: () => void;
  /** Close the search dialog */
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────

export const GlobalSearchDialog: React.FC<GlobalSearchDialogProps> = ({
  query,
  onQueryChange,
  matchCount,
  focusIndex,
  onNextMatch,
  onPrevMatch,
  onClose,
}) => {
  // Handle input within the search dialog
  useInput((input, key) => {
    // Escape: close search
    if (key.escape) {
      onClose();
      return;
    }

    // Enter: next match
    if (key.return) {
      onNextMatch();
      return;
    }

    // Shift+Enter or N (shift): previous match
    if (key.shift && key.return) {
      onPrevMatch();
      return;
    }

    // Backspace: delete last char
    if (key.backspace || key.delete) {
      if (query.length > 0) {
        onQueryChange(query.slice(0, -1));
      } else {
        onClose();
      }
      return;
    }

    // Regular character input
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      onQueryChange(query + input);
    }
  });

  const matchDisplay = matchCount > 0 ? `${focusIndex + 1}/${matchCount}` : 'no matches';

  return (
    <Box flexDirection="row" gap={1} borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        {'>'}
      </Text>
      <Text color="white">{query}</Text>
      <Text color="white" bold>
        █
      </Text>
      <Box flexGrow={1} />
      <Text dimColor>{matchDisplay}</Text>
      <Text dimColor>n/N navigate · Esc close</Text>
    </Box>
  );
};

// ── SearchBox — simplified inline search component ─────

export interface SearchBoxProps {
  /** Current search query */
  query: string;
  /** Callback when query changes */
  onQueryChange: (query: string) => void;
  /** Close the search */
  onClose: () => void;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * SearchBox — a minimal inline search input.
 * Used within other components that need a search capability.
 */
export const SearchBox: React.FC<SearchBoxProps> = ({
  query,
  onQueryChange,
  onClose,
  placeholder = 'Search...',
}) => {
  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.backspace || key.delete) {
      if (query.length > 0) {
        onQueryChange(query.slice(0, -1));
      } else {
        onClose();
      }
      return;
    }
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      onQueryChange(query + input);
    }
  });

  return (
    <Box flexDirection="row" gap={1}>
      <Text color="yellow">{'>'}</Text>
      {query.length > 0 ? <Text>{query}</Text> : <Text dimColor>{placeholder}</Text>}
      <Text bold>█</Text>
    </Box>
  );
};
