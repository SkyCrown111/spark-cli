/**
 * StatusLine — Single-row status line below the input box.
 *
 * Layout mirrors Claude Code's status line:
 *   > chat  claude-sonnet-4  $0.042  ██░░ 42.1K/200K  Ctrl+C interrupt · Ctrl+D exit
 *
 * Left:   mode indicator (❯ + mode name, colored)
 * Center: model name (dimmed) + cost estimate + context bar + token usage
 * Right:  status text or shortcut hints (dimmed)
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ShortcutHint } from '../keybindings/useShortcutDisplay.js';

// ── Props ──────────────────────────────────────────────

export interface StatusLineProps {
  model: string;
  tokensUsed: number;
  tokensBudget: number;
  hints?: ShortcutHint[];
  status?: string;
  /** Current write mode (staging/direct) */
  writeMode?: string;
  /** Current plan mode */
  planMode?: boolean;
  /** Current checkpoint ID (if any) */
  checkpointId?: string;
}

// ── Helpers ────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estimateCost(used: number): string {
  // Rough estimate: $0.003 per 1K input tokens (average across models)
  const cost = (used / 1000) * 0.003;
  if (cost < 0.001) return '';
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function getTokenColor(used: number, budget: number): string {
  if (budget <= 0) return 'green';
  const pct = (used / budget) * 100;
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'yellow';
  return 'green';
}

/**
 * Render a mini context window progress bar.
 *   ██░░░░░░░░  25%
 */
function renderContextBar(used: number, budget: number): string {
  if (budget <= 0) return '';
  const pct = Math.min(1, used / budget);
  const barWidth = 8;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getModeLabel(writeMode?: string, planMode?: boolean): { label: string; color: string } {
  if (planMode) return { label: 'plan', color: 'magenta' };
  if (writeMode === 'direct') return { label: 'direct', color: 'green' };
  return { label: 'staging', color: 'cyan' };
}

// ── Component ──────────────────────────────────────────

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
  const tokenStr = tokensBudget > 0
    ? `${formatTokens(tokensUsed)}/${formatTokens(tokensBudget)}`
    : undefined;
  const contextBar = tokensBudget > 0
    ? renderContextBar(tokensUsed, tokensBudget)
    : '';
  const mode = getModeLabel(writeMode, planMode);

  return (
    <Box flexDirection="row" paddingX={1} justifyContent="space-between" width="100%">
      {/* Left: mode + model + cost + context bar + tokens + checkpoint */}
      <Box flexDirection="row" gap={1}>
        <Text color={mode.color} bold>{mode.label}</Text>
        <Text dimColor>{model}</Text>
        {costStr && <Text color="yellow">{costStr}</Text>}
        {contextBar && <Text color={tokenColor}>{contextBar}</Text>}
        {tokenStr && <Text color={tokenColor}>{tokenStr}</Text>}
        {checkpointId && <Text dimColor>ckpt:{checkpointId.slice(0, 6)}</Text>}
      </Box>

      {/* Right: status or hints */}
      <Box>
        {status ? (
          <Text color="yellow">{status}</Text>
        ) : hints && hints.length > 0 ? (
          <Text dimColor>
            {hints.map((h, i) => (
              <React.Fragment key={h.key}>
                {i > 0 && ' · '}
                {h.key} {h.description}
              </React.Fragment>
            ))}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};
