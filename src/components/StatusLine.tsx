/**
 * StatusLine — Single-row status line below the input box.
 *
 * Layout mirrors Claude Code's status line:
 *   > chat  claude-sonnet-4  42.1K/200K  Ctrl+C interrupt · Ctrl+D exit
 *
 * Left:   mode indicator (❯ + mode name, colored)
 * Center: model name (dimmed)
 * Right:  token usage (color-coded) · shortcut hints (dimmed)
 *
 * When `status` is set, it replaces the shortcut hints on the right.
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
}

// ── Helpers ────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getTokenColor(used: number, budget: number): string {
  if (budget <= 0) return 'green';
  const pct = (used / budget) * 100;
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'yellow';
  return 'green';
}

// ── Component ──────────────────────────────────────────

export const StatusLine: React.FC<StatusLineProps> = ({
  model,
  tokensUsed,
  tokensBudget,
  hints,
  status,
}) => {
  const tokenColor = getTokenColor(tokensUsed, tokensBudget);
  const tokenStr = tokensBudget > 0
    ? `${formatTokens(tokensUsed)}/${formatTokens(tokensBudget)}`
    : undefined;

  return (
    <Box flexDirection="row" paddingX={1} justifyContent="space-between">
      {/* Left: model name + tokens */}
      <Box flexDirection="row" gap={1}>
        <Text dimColor>{model}</Text>
        {tokenStr && <Text color={tokenColor}>{tokenStr}</Text>}
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
                {h.key} to {h.description}
              </React.Fragment>
            ))}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};
