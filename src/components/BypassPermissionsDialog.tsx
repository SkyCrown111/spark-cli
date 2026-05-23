/**
 * BypassPermissionsDialog — confirmation dialog when switching to
 * bypass permissions mode.
 *
 * This is the most permissive permission level — all tool calls
 * are automatically approved without any user confirmation.
 * The dialog requires explicit acknowledgement of the risks.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';

// ── Props ──────────────────────────────────────────────

export interface BypassPermissionsDialogProps {
  /** Callback when user confirms bypass mode */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────

export const BypassPermissionsDialog: React.FC<BypassPermissionsDialogProps> = ({
  onConfirm,
  onCancel,
}) => {
  useRegisterKeybindingContext('Confirmation');

  useKeybinding('confirm:yes', onConfirm);
  useKeybinding('confirm:no', onCancel);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="red">
          ! Bypass All Permissions?
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>This will automatically approve </Text>
        <Text bold color="red">
          ALL
        </Text>
        <Text> tool operations without</Text>
      </Box>
      <Box>
        <Text>asking for permission. This means:</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="red">• Files can be written/modified without review</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="red">• Commands can be executed without approval</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="red">• Network requests can be made without confirmation</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Only use this in trusted environments with code you control.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y / Enter — Enable bypass mode (I understand the risks)</Text>
      </Box>
      <Box>
        <Text dimColor>n / Esc — Keep current permission mode</Text>
      </Box>
    </Box>
  );
};
