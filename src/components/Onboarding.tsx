/**
 * Onboarding — new user introduction flow.
 *
 * Shows a welcome screen with key information for new users:
 * available commands, keybindings, and a brief overview.
 * Disappears on first keypress or Enter.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';

// ── Props ──────────────────────────────────────────────

export interface OnboardingProps {
  /** Callback when user dismisses onboarding */
  onDismiss: () => void;
}

// ── Component ──────────────────────────────────────────

export const Onboarding: React.FC<OnboardingProps> = ({ onDismiss }) => {
  useRegisterKeybindingContext('Help');

  useKeybinding('help:close', onDismiss);
  useKeybinding('confirm:yes', onDismiss);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box paddingBottom={1}>
        <Text bold color="cyan" inverse> Welcome to SparkCLI! </Text>
      </Box>

      <Box paddingBottom={1}>
        <Text>
          SparkCLI is an AI-powered assistant for game development.
          It can generate code, manage files, and interact with your game engine.
        </Text>
      </Box>

      <Box flexDirection="column" paddingBottom={1}>
        <Text bold>Key Shortcuts:</Text>
        <Box flexDirection="row" gap={1} marginTop={1}>
          <KeyboardShortcutHint keyCombo="Ctrl+C" description="Interrupt" />
        </Box>
        <Box flexDirection="row" gap={1}>
          <KeyboardShortcutHint keyCombo="Ctrl+D" description="Exit" />
        </Box>
        <Box flexDirection="row" gap={1}>
          <KeyboardShortcutHint keyCombo="Ctrl+L" description="Clear" />
        </Box>
        <Box flexDirection="row" gap={1}>
          <KeyboardShortcutHint keyCombo="Shift+Tab" description="Switch mode" />
        </Box>
      </Box>

      <Box flexDirection="column" paddingBottom={1}>
        <Text bold>Slash Commands:</Text>
        <Text dimColor>  /help   — Show all commands</Text>
        <Text dimColor>  /model  — Change AI model</Text>
        <Text dimColor>  /clear  — Clear conversation</Text>
        <Text dimColor>  /plan   — Enter plan mode</Text>
        <Text dimColor>  /auto   — Auto-apply mode</Text>
      </Box>

      <Box paddingTop={1}>
        <Text dimColor>Press Enter or Escape to continue...</Text>
      </Box>
    </Box>
  );
};