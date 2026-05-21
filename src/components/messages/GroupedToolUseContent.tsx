/**
 * GroupedToolUseContent — groups consecutive tool calls of the same type.
 *
 * When multiple tool calls of the same name appear consecutively
 * (e.g., 5 read_file calls in a row), this component renders them
 * as a compact summary:
 *
 *   🔧 5× read_file          ▸ expand
 *   ─────────────────────────────
 *   (expanded items if toggled)
 *
 * Mirrors cc-haha's GroupedToolUseContent which collapses
 * repeated tool invocations for a cleaner message stream.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ToolMessage as ToolMessageType } from '../../core/providers/openai-compatible.js';
import { UserToolResultMessage } from './UserToolResultMessage/UserToolResultMessage.js';

// ── Props ──────────────────────────────────────────────

export interface GroupedToolUseContentProps {
  /** Consecutive tool messages with the same tool name */
  messages: ToolMessageType[];
  /** The shared tool name (extracted from tool_call_id) */
  toolName: string;
  /** Whether currently expanded (controlled mode). Uncontrolled if omitted. */
  expanded?: boolean;
  /** Whether to start expanded in uncontrolled mode (default: collapsed) */
  defaultExpanded?: boolean;
}

// ── Component ──────────────────────────────────────────

/**
 * GroupedToolUseContent — renders a group of same-name tool calls.
 *
 * Shows a compact header with count and expand/collapse indicator.
 * When expanded, shows each individual tool result.
 * Expansion state is managed internally unless `expanded` prop is provided.
 */
export const GroupedToolUseContent: React.FC<GroupedToolUseContentProps> = ({
  messages,
  toolName,
  defaultExpanded = false,
  expanded: controlledExpanded,
}) => {
  const expanded = controlledExpanded ?? defaultExpanded;
  const count = messages.length;

  if (count === 1) {
    // Single message — no grouping needed
    return <UserToolResultMessage message={messages[0]} />;
  }

  return (
    <Box flexDirection="column">
      {/* Group header */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="cyan">{'⏺'} {count}×</Text>
        <Text bold>{toolName}</Text>
        <Text
          dimColor
          underline={expanded}
        >
          {expanded ? '▾ collapse' : '▸ expand'}
        </Text>
      </Box>

      {/* Expanded items */}
      {expanded && (
        <Box flexDirection="column" paddingLeft={2}>
          {messages.map((msg, i) => (
            <Box key={msg.tool_call_id ?? i} flexDirection="column">
              <Text dimColor>─ {i + 1}/{count} ─</Text>
              <UserToolResultMessage message={msg} expanded={false} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ── Grouping utility ───────────────────────────────────

export interface ToolGroup {
  toolName: string;
  messages: ToolMessageType[];
}

/**
 * Group consecutive tool messages by their tool name.
 *
 * Tool names are extracted from tool_call_id. If the tool_call_id
 * doesn't contain a recognizable tool name, it's treated as a
 * single-item group.
 *
 * @param messages - Flat list of tool messages
 * @returns Array of grouped tool messages
 */
export function groupConsecutiveTools(messages: ToolMessageType[]): ToolGroup[] {
  if (messages.length === 0) return [];

  const groups: ToolGroup[] = [];
  let currentGroup: ToolGroup | null = null;

  for (const msg of messages) {
    const name = extractToolName(msg.tool_call_id);

    if (currentGroup && currentGroup.toolName === name) {
      currentGroup.messages.push(msg);
    } else {
      currentGroup = { toolName: name, messages: [msg] };
      groups.push(currentGroup);
    }
  }

  return groups;
}

/**
 * Extract a tool name from the tool_call_id.
 *
 * Tool call IDs may contain the tool name in various formats:
 * - "read_file_abc123" → "read_file"
 * - "call_abc123" → "Tool" (generic)
 * - Custom IDs → use as-is
 */
function extractToolName(toolCallId: string): string {
  if (!toolCallId) return 'Tool';

  // If it starts with "call_" it's a generic OpenAI-style ID
  if (toolCallId.startsWith('call_')) return 'Tool';

  // Try to extract tool name from pattern: toolName_randomSuffix
  const underscoreIdx = toolCallId.lastIndexOf('_');
  if (underscoreIdx > 0) {
    // Check if the part after the last underscore looks like a hash
    const suffix = toolCallId.slice(underscoreIdx + 1);
    if (/^[a-f0-9]{6,}$/i.test(suffix)) {
      return toolCallId.slice(0, underscoreIdx);
    }
  }

  return toolCallId;
}
