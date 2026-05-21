/**
 * Group tool uses — clusters consecutive tool-call + tool-result
 * message pairs into logical groups for compact display.
 *
 * When an assistant message contains multiple tool_calls followed
 * by multiple tool results, they are grouped into a single
 * "tool group" that can be rendered with a collapsible header
 * instead of showing each tool call/result pair individually.
 *
 * Inspired by Claude Code's tool grouping behavior.
 */

import type { ChatMessage } from '../core/providers/openai-compatible.js';

// ── Types ──────────────────────────────────────────────────

export interface ToolGroup {
  /** Unique group identifier */
  id: string;
  /** Tool call names in this group */
  toolNames: string[];
  /** Number of tool calls in the group */
  count: number;
  /** Indices of the original messages that belong to this group */
  messageIndices: number[];
}

export interface MessageGroup {
  /** The message itself */
  message: ChatMessage;
  /** Index in the original messages array */
  index: number;
  /** Tool group this message belongs to (if any) */
  toolGroup?: ToolGroup;
}

// ── Grouping logic ─────────────────────────────────────────

let groupCounter = 0;

/**
 * Group consecutive tool calls and their results into ToolGroups.
 *
 * A "tool group" starts when an assistant message has tool_calls
 * and ends after all corresponding tool result messages have been seen.
 * Any intervening user/assistant text messages break the group.
 */
export function groupToolUses(messages: ChatMessage[]): MessageGroup[] {
  const result: MessageGroup[] = [];
  let currentGroup: ToolGroup | undefined;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // Start or extend a tool group
      const toolNames = msg.tool_calls.map((tc) => {
        // Extract function name from the tool call
        if (typeof tc === 'object' && 'function' in tc) {
          return (tc as { function: { name: string } }).function.name;
        }
        return String(tc);
      });

      if (currentGroup) {
        // Extend existing group
        currentGroup.toolNames.push(...toolNames);
        currentGroup.count += toolNames.length;
        currentGroup.messageIndices.push(i);
      } else {
        // Start new group
        currentGroup = {
          id: `tool-group-${++groupCounter}`,
          toolNames,
          count: toolNames.length,
          messageIndices: [i],
        };
      }

      result.push({ message: msg, index: i, toolGroup: currentGroup });
    } else if (msg.role === 'tool' && currentGroup) {
      // Tool result belongs to current group
      currentGroup.messageIndices.push(i);
      result.push({ message: msg, index: i, toolGroup: currentGroup });
    } else {
      // Non-tool message breaks the group
      currentGroup = undefined;
      result.push({ message: msg, index: i });
    }
  }

  return result;
}

/**
 * Get a summary label for a tool group.
 * E.g., "3 tool calls: read_file, write_file, bash"
 */
export function getToolGroupLabel(group: ToolGroup): string {
  const uniqueNames = [...new Set(group.toolNames)];
  if (uniqueNames.length === 1) {
    return `${group.count}× ${uniqueNames[0]}`;
  }
  return `${group.count} tools: ${uniqueNames.slice(0, 3).join(', ')}${uniqueNames.length > 3 ? '...' : ''}`;
}
