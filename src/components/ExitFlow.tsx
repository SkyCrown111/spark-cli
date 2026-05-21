/**
 * ExitFlow — graceful exit confirmation overlay.
 *
 * When the user presses Ctrl+D, this overlay appears to confirm
 * the exit. Pressing Ctrl+D again or Enter confirms, Escape cancels.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';

// ── Props ──────────────────────────────────────────────

export interface ExitFlowProps {
  /** Callback when user confirms exit */
  onConfirmExit: () => void;
  /** Callback when user cancels exit */
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────

export const ExitFlow: React.FC<ExitFlowProps> = ({
  onConfirmExit,
  onCancel,
}) => {
  // Register Confirmation context
  useRegisterKeybindingContext('Confirmation');

  // Bind exit actions
  useKeybinding('confirm:yes', onConfirmExit);
  useKeybinding('confirm:no', onCancel);
  useKeybinding('app:exit', onConfirmExit);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>Exit SparkCLI?</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y / Enter / Ctrl+D — Confirm exit</Text>
      </Box>
      <Box>
        <Text dimColor>n / Esc — Cancel and continue</Text>
      </Box>
    </Box>
  );
};