/**
 * TokenCounter component - Displays token usage information
 * Shows current token usage vs budget with color-coded status
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';

export interface TokenCounterProps {
  /** Number of tokens used */
  tokensUsed: number;
  
  /** Total token budget/limit */
  tokensBudget: number;
  
  /** Whether to show the label */
  showLabel?: boolean;
  
  /** Whether to show percentage */
  showPercentage?: boolean;
}

/**
 * Get the color based on token usage percentage
 */
const getTokenColor = (percentage: number): string => {
  if (percentage >= 90) return 'red';
  if (percentage >= 70) return 'yellow';
  return 'green';
};

/**
 * Format large numbers with K/M suffixes
 */
const formatTokenCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

/**
 * TokenCounter component for displaying token usage
 * 
 * Features:
 * - Color-coded based on usage percentage (green < 70%, yellow < 90%, red >= 90%)
 * - Compact number formatting (K/M suffixes)
 * - Optional percentage display
 * 
 * @example
 * ```tsx
 * <TokenCounter tokensUsed={1000} tokensBudget={200000} />
 * <TokenCounter tokensUsed={150000} tokensBudget={200000} showPercentage={true} />
 * ```
 */
export const TokenCounter: React.FC<TokenCounterProps> = ({ 
  tokensUsed,
  tokensBudget,
  showLabel = true,
  showPercentage = false,
}) => {
  const percentage = (tokensUsed / tokensBudget) * 100;
  const color = getTokenColor(percentage);
  
  return (
    <Box>
      {showLabel && (
        <Text bold>Tokens: </Text>
      )}
      <Text color={color}>
        {formatTokenCount(tokensUsed)}/{formatTokenCount(tokensBudget)}
      </Text>
      {showPercentage && (
        <Text color={color} dimColor>
          {' '}({percentage.toFixed(1)}%)
        </Text>
      )}
    </Box>
  );
};
