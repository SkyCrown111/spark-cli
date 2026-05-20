/**
 * ProgressIndicator component - Shows progress for multi-step operations
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { Spinner } from './Spinner.js';

export interface ProgressIndicatorProps {
  /** Current step number (1-based) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Description of current step */
  label?: string;
  /** Spinner type */
  spinnerType?: 'dots' | 'line' | 'arc';
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentStep,
  totalSteps,
  label,
  spinnerType = 'dots',
}) => {
  return (
    <Box flexDirection="row" gap={1}>
      <Spinner type={spinnerType} label="" color="cyan" />
      <Text>
        <Text bold color="cyan">{`[${currentStep}/${totalSteps}]`}</Text>
        {label ? <Text dimColor>{` ${label}`}</Text> : null}
      </Text>
    </Box>
  );
};
