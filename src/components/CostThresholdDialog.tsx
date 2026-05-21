/**
 * CostThresholdDialog — confirmation dialog when estimated
 * cost exceeds a configured threshold.
 *
 * Shows the estimated cost and asks the user whether to proceed.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';

// ── Props ──────────────────────────────────────────────

export interface CostThresholdDialogProps {
  /** Estimated cost in dollars */
  estimatedCost: number;
  /** Cost threshold setting */
  threshold: number;
  /** Callback when user approves */
  onApprove: () => void;
  /** Callback when user denies */
  onDeny: () => void;
}

// ── Component ──────────────────────────────────────────

export const CostThresholdDialog: React.FC<CostThresholdDialogProps> = ({
  estimatedCost,
  threshold,
  onApprove,
  onDeny,
}) => {
  useRegisterKeybindingContext('Confirmation');

  useKeybinding('confirm:yes', onApprove);
  useKeybinding('confirm:no', onDeny);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="yellow">! Cost Threshold Warning</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Estimated cost: </Text>
        <Text bold color="yellow">${estimatedCost.toFixed(4)}</Text>
      </Box>
      <Box>
        <Text>Your threshold: </Text>
        <Text>${threshold.toFixed(4)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y / Enter — Proceed anyway</Text>
      </Box>
      <Box>
        <Text dimColor>n / Esc — Cancel this operation</Text>
      </Box>
    </Box>
  );
};