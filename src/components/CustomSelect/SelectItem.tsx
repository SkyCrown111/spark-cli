/**
 * SelectItem — renders a single item in a CustomSelect list.
 * Can be used standalone for custom select layouts.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface SelectItemProps {
  label: string;
  description?: string;
  isFocused: boolean;
  isSelected?: boolean;
  isDisabled?: boolean;
}

export const SelectItem: React.FC<SelectItemProps> = ({
  label,
  description,
  isFocused,
  isSelected = false,
  isDisabled = false,
}) => {
  return (
    <Box>
      <Text>
        {isFocused ? '❯ ' : '  '}
        {isSelected ? '● ' : '  '}
      </Text>
      <Text
        color={isDisabled ? 'gray' : isFocused ? 'cyan' : undefined}
        bold={isFocused}
        dimColor={isDisabled}
      >
        {label}
      </Text>
      {description && isFocused && (
        <Text dimColor> — {description}</Text>
      )}
    </Box>
  );
};