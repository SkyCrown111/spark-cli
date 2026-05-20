/**
 * PromptInputFooter — bottom bar below the input area.
 *
 * Shows: mode indicator + model name + cost/permission mode + keybinding hints.
 * Inspired by Claude Code's footer bar layout.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from '../PromptInput/PromptInput.js';
import type { PermissionMode } from '../../state/AppState.js';
import type { ShortcutHint } from '../../keybindings/useShortcutDisplay.js';

// ── Props ──────────────────────────────────────────────

export interface PromptInputFooterProps {
  /** Current input mode */
  mode: InputMode;
  /** Current model name */
  model: string;
  /** Permission mode */
  permissionMode: PermissionMode;
  /** Token usage display */
  tokenDisplay?: string;
  /** Dynamic shortcut hints */
  hints?: ShortcutHint[];
  /** Whether input is disabled */
  disabled?: boolean;
}

// ── Mode color ─────────────────────────────────────────

function getModeColor(mode: InputMode): string {
  switch (mode) {
    case 'chat':    return 'cyan';
    case 'direct':  return 'green';
    case 'plan':    return 'magenta';
    default:        return 'white';
  }
}

function getPermissionLabel(mode: PermissionMode): string {
  switch (mode) {
    case 'default': return '';
    case 'plan':    return 'ⓟ';
    case 'auto':    return 'ⓐ';
    case 'bypass':  return 'ⓑ';
    default:        return '';
  }
}

// ── Component ──────────────────────────────────────────

export const PromptInputFooter: React.FC<PromptInputFooterProps> = ({
  mode,
  model,
  permissionMode,
  tokenDisplay,
  hints,
  disabled,
}) => {
  const modeColor = getModeColor(mode);
  const permLabel = getPermissionLabel(permissionMode);

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      {/* Left side: mode + permission + model */}
      <Box flexDirection="row" gap={1}>
        <Text color={modeColor} bold>[{mode}]</Text>
        {permLabel && <Text color="yellow">{permLabel}</Text>}
        <Text dimColor>{model}</Text>
        {disabled && <Text dimColor color="gray">(disabled)</Text>}
      </Box>

      {/* Center: token usage */}
      {tokenDisplay && (
        <Box>
          <Text dimColor>{tokenDisplay}</Text>
        </Box>
      )}

      {/* Right side: shortcut hints */}
      {hints && hints.length > 0 && (
        <Box flexDirection="row" gap={1}>
          {hints.slice(0, 4).map((hint, i) => (
            <Box key={i}>
              <Text backgroundColor="gray" color="white"> {hint.key} </Text>
              <Text dimColor> {hint.description}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};