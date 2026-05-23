/**
 * ThinkingToggle — controls the visibility of thinking blocks.
 *
 * When the AI model outputs extended thinking, this component
 * provides a toggle to show/hide the thinking content.
 * The thinking block can be expanded/collapsed, and the
 * preference is stored in AppState.
 *
 * Mirrors cc-haha's ThinkingToggle component.
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Props ──────────────────────────────────────────────

export interface ThinkingToggleProps {
  /** Whether thinking content is currently visible */
  expanded: boolean;
  /** Estimated token count of the thinking block */
  tokenCount?: number;
  /** Whether the thinking is still streaming */
  isStreaming?: boolean;
}

// ── Component ──────────────────────────────────────────

export const ThinkingToggle: React.FC<ThinkingToggleProps> = ({
  expanded,
  tokenCount,
  isStreaming = false,
}) => {
  const icon = expanded ? '▾' : '▸';
  const label = isStreaming ? 'Thinking...' : 'Thinking';
  const tokenLabel = tokenCount ? ` (~${tokenCount} tokens)` : '';

  return (
    <Box flexDirection="row" gap={1}>
      <Text dimColor bold>
        {icon}
      </Text>
      <Text dimColor italic>
        {label}
        {tokenLabel}
      </Text>
      {!expanded && !isStreaming && <Text dimColor>(enter to expand)</Text>}
    </Box>
  );
};

// ── ThinkingBlock — wraps thinking content with toggle ──

export interface ThinkingBlockProps {
  /** The thinking content to display */
  content: string;
  /** Whether thinking is currently shown (from AppState) */
  showThinking: boolean;
  /** Whether the thinking is still streaming */
  isStreaming?: boolean;
}

/**
 * ThinkingBlock — renders a collapsible thinking block.
 *
 * When collapsed, shows just the ThinkingToggle header.
 * When expanded, shows the full thinking content.
 */
export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  showThinking,
  isStreaming = false,
}) => {
  const tokenCount = Math.round(content.length / 4); // rough estimate

  return (
    <Box flexDirection="column" marginY={1}>
      <ThinkingToggle expanded={showThinking} tokenCount={tokenCount} isStreaming={isStreaming} />
      {showThinking && content && (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dimColor italic wrap="wrap">
            {content}
          </Text>
        </Box>
      )}
    </Box>
  );
};
