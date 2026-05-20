/**
 * StatusBar component - Main status bar displaying mode, model, and token usage
 * Provides a comprehensive status overview at the bottom of the REPL interface
 */

import React from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { ModeIndicator } from './ModeIndicator.js';
import { TokenCounter } from './TokenCounter.js';
import type { InputMode } from '../PromptInput/PromptInput.js';

export interface StatusBarProps {
  /** Current input mode */
  mode: InputMode;
  
  /** Number of tokens used in current session */
  tokensUsed: number;
  
  /** Total token budget/limit */
  tokensBudget: number;
  
  /** Current model name */
  model: string;
  
  /** Optional additional status text */
  status?: string;
  
  /** Whether to show the border */
  showBorder?: boolean;
  
  /** Whether to show token percentage */
  showTokenPercentage?: boolean;
}

/**
 * StatusBar component for displaying comprehensive status information
 * 
 * Layout:
 * - Left: Mode indicator
 * - Center: Model name
 * - Right: Token counter
 * - Optional: Additional status text
 * 
 * @example
 * ```tsx
 * <StatusBar 
 *   mode="chat"
 *   tokensUsed={1000}
 *   tokensBudget={200000}
 *   model="gpt-4"
 * />
 * 
 * <StatusBar 
 *   mode="direct"
 *   tokensUsed={150000}
 *   tokensBudget={200000}
 *   model="claude-3-opus"
 *   status="Processing..."
 *   showTokenPercentage={true}
 * />
 * ```
 */
export const StatusBar: React.FC<StatusBarProps> = ({ 
  mode,
  tokensUsed,
  tokensBudget,
  model,
  status,
  showBorder = true,
  showTokenPercentage = false,
}) => {
  return (
    <Box 
      flexDirection="column"
      borderStyle={showBorder ? 'single' : undefined}
      borderColor="gray"
    >
      {/* Main status bar */}
      <Box 
        justifyContent="space-between" 
        paddingX={1}
        paddingY={0}
      >
        {/* Left: Mode indicator */}
        <Box minWidth={15}>
          <ModeIndicator mode={mode} showLabel={true} />
        </Box>
        
        {/* Center: Model name */}
        <Box flexGrow={1} justifyContent="center">
          <Text bold>Model: </Text>
          <Text color="blue">{model}</Text>
        </Box>
        
        {/* Right: Token counter */}
        <Box minWidth={20} justifyContent="flex-end">
          <TokenCounter 
            tokensUsed={tokensUsed}
            tokensBudget={tokensBudget}
            showLabel={true}
            showPercentage={showTokenPercentage}
          />
        </Box>
      </Box>
      
      {/* Optional status text */}
      {status && (
        <Box paddingX={1} paddingBottom={0}>
          <Text dimColor>Status: </Text>
          <Text color="yellow">{status}</Text>
        </Box>
      )}
    </Box>
  );
};
