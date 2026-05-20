/**
 * SpinnerWithVerb — enhanced spinner that displays a dynamic
 * verb based on the current operation.
 *
 * Instead of a static "Thinking..." label, the spinner shows
 * context-appropriate verbs like "Reading file.txt",
 * "Writing", "Searching", etc.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../design-system/Spinner.js';
import { getVerbForTool, DEFAULT_VERB } from '../../constants/spinnerVerbs.js';

// ── Props ──────────────────────────────────────────────

export interface SpinnerWithVerbProps {
  /** Current tool or operation identifier */
  toolId?: string;
  /** Additional context (e.g., file name) */
  detail?: string;
  /** Override verb label */
  verbOverride?: string;
  /** Spinner color */
  color?: string;
  /** Spinner animation type */
  type?: 'dots' | 'line' | 'bouncingBar' | 'arc';
}

// ── Shimmer effect ─────────────────────────────────────

const SHIMMER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * SpinnerWithVerb — dynamic verb spinner.
 */
export const SpinnerWithVerb: React.FC<SpinnerWithVerbProps> = ({
  toolId,
  detail,
  verbOverride,
  color = 'cyan',
  type = 'dots',
}) => {
  const [shimmerIdx, setShimmerIdx] = useState(0);

  // Animate shimmer
  useEffect(() => {
    const timer = setInterval(() => {
      setShimmerIdx((prev) => (prev + 1) % SHIMMER_CHARS.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  // Determine verb
  const verb = verbOverride ?? (toolId ? getVerbForTool(toolId) : DEFAULT_VERB);

  // Build label
  const label = detail ? `${verb} ${detail}` : verb;

  return (
    <Box flexDirection="row" gap={1}>
      <Spinner type={type} color={color} />
      <Text color={color}>{label}</Text>
      <Text dimColor>{SHIMMER_CHARS[shimmerIdx]}</Text>
    </Box>
  );
};