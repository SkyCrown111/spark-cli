/**
 * PermissionRequest — interactive permission confirmation dialog.
 *
 * Displays a tool permission request with y/n options,
 * replacing the readline-based tool-confirm module
 * when running in Ink mode.
 *
 * Uses the Confirmation keybinding context (y/Enter = yes, n/Esc = no).
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../../keybindings/useKeybinding.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';

// ── Types ──────────────────────────────────────────────

export interface PermissionRequestProps {
  /** Tool name requesting permission */
  tool: string;
  /** Summary of the tool action */
  argsSummary: string;
  /** Whether "always allow" option is available */
  showAlwaysAllow?: boolean;
  /** Callback when user approves */
  onApprove: (always: boolean) => void;
  /** Callback when user denies */
  onDeny: () => void;
}

// ── Component ──────────────────────────────────────────

export const PermissionRequest: React.FC<PermissionRequestProps> = ({
  tool,
  argsSummary,
  showAlwaysAllow = true,
  onApprove,
  onDeny,
}) => {
  // Register Confirmation context
  useRegisterKeybindingContext('Confirmation');

  // Bind confirmation actions
  useKeybinding('confirm:yes', () => onApprove(false));
  useKeybinding('confirm:always', () => onApprove(true), showAlwaysAllow);
  useKeybinding('confirm:no', () => onDeny());

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="yellow">{'⏺'} </Text>
        <Text bold color="cyan">
          {tool}
        </Text>
        <Text dimColor> — {argsSummary}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y — Allow once</Text>
      </Box>
      {showAlwaysAllow && (
        <Box>
          <Text dimColor>a — Always allow this tool</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>n / Esc — Deny</Text>
      </Box>
    </Box>
  );
};
