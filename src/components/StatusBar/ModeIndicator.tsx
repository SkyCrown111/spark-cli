/**
 * ModeIndicator component - Displays the current input mode
 * Shows the active mode (chat/direct/plan) with appropriate styling
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import type { InputMode } from '../PromptInput/PromptInput.js';

export interface ModeIndicatorProps {
  /** Current input mode */
  mode: InputMode;
  
  /** Whether to show the mode label */
  showLabel?: boolean;
}

/**
 * Get the color for a specific mode
 */
const getModeColor = (mode: InputMode): string => {
  switch (mode) {
    case 'chat': return 'cyan';
    case 'direct': return 'green';
    case 'plan': return 'magenta';
    default: return 'white';
  }
};

/**
 * Get the display name for a specific mode
 */
const getModeDisplayName = (mode: InputMode): string => {
  switch (mode) {
    case 'chat': return 'Chat';
    case 'direct': return 'Direct';
    case 'plan': return 'Plan';
    default: return mode;
  }
};

/**
 * ModeIndicator component for displaying the current mode
 * 
 * @example
 * ```tsx
 * <ModeIndicator mode="chat" />
 * <ModeIndicator mode="direct" showLabel={true} />
 * ```
 */
export const ModeIndicator: React.FC<ModeIndicatorProps> = ({ 
  mode,
  showLabel = true,
}) => {
  return (
    <Box>
      {showLabel && (
        <Text bold>Mode: </Text>
      )}
      <Text color={getModeColor(mode)} bold>
        {getModeDisplayName(mode)}
      </Text>
    </Box>
  );
};
