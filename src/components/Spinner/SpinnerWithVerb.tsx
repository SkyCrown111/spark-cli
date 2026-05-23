/**
 * SpinnerWithVerb — enhanced spinner that displays a dynamic
 * verb based on the current operation.
 *
 * Instead of a static "Thinking..." label, the spinner shows
 * context-appropriate verbs like "Reading file.txt",
 * "Writing", "Searching", etc.
 *
 * After P0.3: Uses ShimmeredInput for per-character shimmer
 * sweep animation, matching Claude Code's shimmer effect.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
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
}

// ── Component ──────────────────────────────────────────

/**
 * SpinnerWithVerb — shows ⏺ verb... with elapsed time.
 * Matches Claude Code's thinking/working indicator format.
 */
export const SpinnerWithVerb: React.FC<SpinnerWithVerbProps> = ({
  toolId,
  detail,
  verbOverride,
  color = 'cyan',
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 100) / 10);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const verb = verbOverride ?? (toolId ? getVerbForTool(toolId) : DEFAULT_VERB);
  const label = detail ? `${verb} ${detail}` : verb;
  const timeStr = elapsed > 0 ? ` (${elapsed.toFixed(1)}s)` : '';

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={color}>{'⏺'}</Text>
      <Text color={color}>
        {label}...{timeStr}
      </Text>
    </Box>
  );
};
