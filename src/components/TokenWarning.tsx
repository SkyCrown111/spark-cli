/**
 * TokenWarning — displays a warning when token usage exceeds a threshold.
 *
 * Shows a prominent warning bar when the conversation is approaching
 * or has exceeded the token budget, suggesting context compaction
 * or starting a new session.
 *
 * Mirrors cc-haha's TokenWarning component.
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Props ──────────────────────────────────────────────

export interface TokenWarningProps {
  /** Current token usage */
  used: number;
  /** Token budget */
  budget: number;
  /** Warning threshold as a fraction (0-1, default: 0.8 = 80%) */
  threshold?: number;
}

// ── Component ──────────────────────────────────────────

export const TokenWarning: React.FC<TokenWarningProps> = ({
  used,
  budget,
  threshold = 0.8,
}) => {
  const ratio = budget > 0 ? used / budget : 0;
  const percentage = Math.round(ratio * 100);

  // Don't show warning if below threshold
  if (ratio < threshold) return null;

  const isCritical = ratio >= 1.0;
  const color = isCritical ? 'red' : 'yellow';
  const icon = isCritical ? '!' : '!';
  const message = isCritical
    ? 'Token budget exceeded! Start a new session or compact history.'
    : `Token usage at ${percentage}%. Consider compacting history.`;

  return (
    <Box
      flexDirection="row"
      gap={1}
      paddingX={1}
    >
      <Text color={color}>{icon}</Text>
      <Text color={color} bold>{message}</Text>
      <Text dimColor>{(used / 1000).toFixed(1)}K / {(budget / 1000).toFixed(0)}K</Text>
    </Box>
  );
};
