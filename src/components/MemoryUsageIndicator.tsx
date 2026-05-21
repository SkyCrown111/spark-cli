/**
 * MemoryUsageIndicator — shows the current memory usage of the process.
 *
 * Displays a compact indicator in the status line showing RSS memory.
 * When memory usage is high (>80% of a 512MB soft limit), shows
 * a warning color.
 *
 * Mirrors cc-haha's MemoryUsageIndicator.
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Props ──────────────────────────────────────────────

export interface MemoryUsageIndicatorProps {
  /** Soft memory limit in MB (default: 512) */
  limitMb?: number;
}

// ── Component ──────────────────────────────────────────

/**
 * Get current process memory usage in MB.
 */
function getMemoryMb(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.rss / 1024 / 1024);
}

export const MemoryUsageIndicator: React.FC<MemoryUsageIndicatorProps> = ({
  limitMb = 512,
}) => {
  const usedMb = getMemoryMb();
  const ratio = usedMb / limitMb;

  // Don't show indicator if memory usage is low (<50%)
  if (ratio < 0.5) return null;

  const color = ratio >= 0.9 ? 'red' : ratio >= 0.7 ? 'yellow' : 'dim';
  const icon = ratio >= 0.9 ? '!' : ratio >= 0.7 ? '!' : '';

  return (
    <Box flexDirection="row" gap={1}>
      <Text>{icon}</Text>
      <Text color={color}>{usedMb}MB</Text>
    </Box>
  );
};
