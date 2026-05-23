/**
 * Status line below the input box.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ShortcutHint } from '../keybindings/useShortcutDisplay.js';

export interface StatusLineProps {
  model: string;
  tokensUsed: number;
  tokensBudget: number;
  hints?: ShortcutHint[];
  status?: string;
  writeMode?: string;
  planMode?: boolean;
  checkpointId?: string;
}

const PINK = '#F472B6';
const PINK_SOFT = '#F9A8D4';
const DIM = '#71717A';
const WARN = '#FBCFE8';
const HOT = '#FB7185';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estimateCost(used: number): string {
  const cost = (used / 1000) * 0.003;
  if (cost < 0.001) return '';
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function getTokenColor(used: number, budget: number): string {
  if (budget <= 0) return PINK_SOFT;
  const pct = (used / budget) * 100;
  if (pct >= 90) return HOT;
  if (pct >= 70) return WARN;
  return PINK_SOFT;
}

function renderContextBar(used: number, budget: number): string {
  if (budget <= 0) return '';
  const pct = Math.min(1, used / budget);
  const barWidth = 8;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  return '#'.repeat(filled) + '-'.repeat(empty);
}

function getModeLabel(writeMode?: string, planMode?: boolean): { label: string; color: string } {
  if (planMode) return { label: 'plan', color: '#EC4899' };
  if (writeMode === 'direct') return { label: 'direct', color: PINK_SOFT };
  return { label: 'staging', color: PINK };
}

export const StatusLine: React.FC<StatusLineProps> = ({
  model,
  tokensUsed,
  tokensBudget,
  hints,
  status,
  writeMode,
  planMode,
  checkpointId,
}) => {
  const tokenColor = getTokenColor(tokensUsed, tokensBudget);
  const costStr = estimateCost(tokensUsed);
  const tokenStr =
    tokensBudget > 0 ? `${formatTokens(tokensUsed)}/${formatTokens(tokensBudget)}` : undefined;
  const contextBar = tokensBudget > 0 ? renderContextBar(tokensUsed, tokensBudget) : '';
  const mode = getModeLabel(writeMode, planMode);

  return (
    <Box flexDirection="row" paddingX={1} justifyContent="space-between" width="100%">
      <Box flexDirection="row" gap={1}>
        <Text color={mode.color} bold>
          {mode.label}
        </Text>
        <Text color={DIM}>{model}</Text>
        {costStr && <Text color={WARN}>{costStr}</Text>}
        {contextBar && <Text color={tokenColor}>{contextBar}</Text>}
        {tokenStr && <Text color={tokenColor}>{tokenStr}</Text>}
        {checkpointId && <Text color={DIM}>ckpt:{checkpointId.slice(0, 6)}</Text>}
      </Box>
      <Box>
        {status ? (
          <Text color={WARN}>{status}</Text>
        ) : hints && hints.length > 0 ? (
          <Text color={DIM}>
            {hints.map((h, i) => (
              <React.Fragment key={h.key}>
                {i > 0 && ' * '}
                {h.key} {h.description}
              </React.Fragment>
            ))}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};
