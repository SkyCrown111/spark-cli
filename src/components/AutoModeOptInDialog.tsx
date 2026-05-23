/**
 * AutoModeOptInDialog — confirmation dialog when switching to
 * auto mode (bypassing permission checks).
 *
 * Warns the user about the implications and requires explicit
 * confirmation before enabling.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';

// ── Props ──────────────────────────────────────────────

export interface AutoModeOptInDialogProps {
  /** Callback when user confirms auto mode */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────

export const AutoModeOptInDialog: React.FC<AutoModeOptInDialogProps> = ({
  onConfirm,
  onCancel,
}) => {
  useRegisterKeybindingContext('Confirmation');

  useKeybinding('confirm:yes', onConfirm);
  useKeybinding('confirm:no', onCancel);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="yellow">
          ! Enable Auto Mode?
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>Auto mode automatically approves most tool operations</Text>
      </Box>
      <Box>
        <Text>without asking for permission. This means files may be</Text>
      </Box>
      <Box>
        <Text color="red">written directly to your project without review.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y / Enter — Enable auto mode (I understand the risks)</Text>
      </Box>
      <Box>
        <Text dimColor>n / Esc — Keep current permission mode</Text>
      </Box>
    </Box>
  );
};
