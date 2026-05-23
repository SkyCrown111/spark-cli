/**
 * Settings panel — interactive settings overlay.
 *
 * Displays key configuration options in a Select-based UI,
 * allowing the user to toggle permissions, write mode,
 * vim mode, and other settings interactively.
 */

import React, { useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { CustomSelect, type SelectOption } from '../CustomSelect/index.js';
import { useRegisterKeybindingContext } from '../../keybindings/useKeybinding.js';
import type { PermissionMode } from '../../state/AppState.js';

// ── Permission mode descriptions ──

const PERMISSION_MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: 'Ask for permission on risky operations',
  plan: 'Plan mode — propose changes, no auto-apply',
  auto: 'Automatically approve most operations',
  acceptEdits: 'Auto-approve file edits; ask for risky ops',
  dontAsk: 'Only pre-approved tools; auto-deny the rest',
  bypass: 'Bypass all permission checks (dangerous)',
};

// ── Props ──────────────────────────────────────────────

export interface SettingsPanelProps {
  /** Current write mode */
  writeMode: 'staging' | 'direct';
  /** Current permission mode */
  permissionMode: PermissionMode;
  /** Whether vim mode is enabled */
  vimEnabled: boolean;
  /** Whether companion sprite is enabled */
  companionEnabled: boolean;
  /** Callback when a setting changes */
  onSettingChange: (key: string, value: any) => void;
  /** Callback when user closes settings */
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  writeMode,
  permissionMode,
  vimEnabled,
  companionEnabled,
  onSettingChange,
  onClose,
}) => {
  // Register Settings context
  useRegisterKeybindingContext('Settings');

  const options = useMemo<SelectOption[]>(
    () => [
      {
        value: 'writeMode',
        label: `Write Mode: ${writeMode === 'direct' ? 'Direct (auto-apply)' : 'Staging (review first)'}`,
        description:
          writeMode === 'direct'
            ? 'Files are written directly to your project'
            : 'Files go to staging area, review before applying',
      },
      {
        value: 'permissionMode',
        label: `Permission Mode: ${permissionMode}`,
        description: PERMISSION_MODE_DESCRIPTIONS[permissionMode],
      },
      {
        value: 'vimEnabled',
        label: `Vim Mode: ${vimEnabled ? 'On' : 'Off'}`,
        description: vimEnabled
          ? 'Use vim-style navigation in input (h/j/k/l)'
          : 'Standard input mode',
      },
      {
        value: 'companionEnabled',
        label: `Companion Sprite: ${companionEnabled ? 'On' : 'Off'}`,
        description: companionEnabled
          ? 'Show companion mascot animations'
          : 'Hide companion mascot',
      },
      {
        value: 'close',
        label: 'Close Settings',
        description: 'Return to chat',
      },
    ],
    [writeMode, permissionMode, vimEnabled, companionEnabled],
  );

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'close') {
        onClose();
        return;
      }

      // Toggle settings
      if (value === 'writeMode') {
        onSettingChange('writeMode', writeMode === 'staging' ? 'direct' : 'staging');
      } else if (value === 'permissionMode') {
        const modes: PermissionMode[] = [
          'default',
          'acceptEdits',
          'plan',
          'auto',
          'dontAsk',
          'bypass',
        ];
        const nextIdx = modes.indexOf(permissionMode) + 1;
        onSettingChange('permissionMode', modes[nextIdx % modes.length]);
      } else if (value === 'vimEnabled') {
        onSettingChange('vimEnabled', !vimEnabled);
      } else if (value === 'companionEnabled') {
        onSettingChange('companionEnabled', !companionEnabled);
      }
    },
    [writeMode, permissionMode, vimEnabled, companionEnabled, onSettingChange, onClose],
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box paddingBottom={1}>
        <Text bold color="cyan">
          Settings
        </Text>
      </Box>

      <CustomSelect options={options} onSelect={handleSelect} onCancel={onClose} maxVisible={8} />
    </Box>
  );
};
