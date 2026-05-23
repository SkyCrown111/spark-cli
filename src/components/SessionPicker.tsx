/**
 * SessionPicker — overlay for selecting a session to resume.
 *
 * Shows a list of recent sessions with their IDs, titles, and timestamps.
 * User can navigate with arrow keys and select with Enter.
 *
 * Mirrors Claude Code's session picker experience.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';

// ── Types ──────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  name?: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface SessionPickerProps {
  /** Available sessions to pick from */
  sessions: SessionInfo[];
  /** Callback when a session is selected */
  onSelect: (sessionId: string) => void;
  /** Callback when picker is dismissed */
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────

export const SessionPicker: React.FC<SessionPickerProps> = ({ sessions, onSelect, onCancel }) => {
  const [focusIndex, setFocusIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setFocusIndex((prev) => (prev > 0 ? prev - 1 : sessions.length - 1));
      return;
    }

    if (key.downArrow) {
      setFocusIndex((prev) => (prev + 1) % sessions.length);
      return;
    }

    if (key.return) {
      if (sessions.length > 0) {
        onSelect(sessions[focusIndex].id);
      }
      return;
    }

    // Number keys for quick select
    if (input && /^[0-9]$/.test(input)) {
      const idx = parseInt(input, 10);
      if (idx < sessions.length) {
        onSelect(sessions[idx].id);
      }
    }
  });

  const displaySessions = useMemo(() => sessions.slice(0, 10), [sessions]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Resume Session
        </Text>
        <Text dimColor> — ↑↓ navigate, Enter select, Esc cancel</Text>
      </Box>

      {displaySessions.length === 0 ? (
        <Text dimColor>No saved sessions found.</Text>
      ) : (
        displaySessions.map((session, idx) => {
          const isFocused = idx === focusIndex;
          const updated = session.updatedAt.slice(0, 16).replace('T', ' ');
          const title = session.name || session.title || 'Untitled';

          return (
            <Box key={session.id} gap={1}>
              <Text color={isFocused ? 'cyan' : 'dim'}>{isFocused ? '❯' : ' '}</Text>
              <Text color={isFocused ? 'white' : 'dim'} bold={isFocused}>
                {idx}
              </Text>
              <Text color={isFocused ? 'white' : 'dim'}>
                {title.length > 30 ? title.slice(0, 27) + '...' : title}
              </Text>
              <Box flexGrow={1} />
              <Text dimColor>{session.messageCount} msgs</Text>
              <Text dimColor>{updated}</Text>
            </Box>
          );
        })
      )}

      {sessions.length > 10 && <Text dimColor>... and {sessions.length - 10} more</Text>}
    </Box>
  );
};
