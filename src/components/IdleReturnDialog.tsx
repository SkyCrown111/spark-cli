/**
 * IdleReturnDialog — dialog shown when the user returns after
 * being idle for an extended period.
 *
 * Reminds the user of the current conversation context and
 * offers to continue or start fresh.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';

// ── Props ──────────────────────────────────────────────

export interface IdleReturnDialogProps {
  /** How long the user was idle (human-readable) */
  idleDuration: string;
  /** Number of messages in current conversation */
  messageCount: number;
  /** Callback when user continues existing conversation */
  onContinue: () => void;
  /** Callback when user starts a fresh conversation */
  onStartFresh: () => void;
}

// ── Component ──────────────────────────────────────────

export const IdleReturnDialog: React.FC<IdleReturnDialogProps> = ({
  idleDuration,
  messageCount,
  onContinue,
  onStartFresh,
}) => {
  useRegisterKeybindingContext('Confirmation');

  useKeybinding('confirm:yes', onContinue);
  useKeybinding('confirm:no', onStartFresh);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="single" borderColor="cyan">
      <Box>
        <Text bold color="cyan">Welcome back!</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>You were away for {idleDuration}.</Text>
      </Box>
      <Box>
        <Text dimColor>You have {messageCount} messages in this session.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y / Enter — Continue current session</Text>
      </Box>
      <Box>
        <Text dimColor>n / Esc — Start fresh conversation</Text>
      </Box>
    </Box>
  );
};