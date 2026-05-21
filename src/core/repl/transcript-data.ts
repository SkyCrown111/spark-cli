/**
 * Transcript data builder — structures agent history for display.
 *
 * Converts the flat ChatMessage[] history into a structured
 * TranscriptEntry[] that the TranscriptOverlay can render.
 * Pairs assistant tool_calls with their corresponding tool result
 * messages, computing duration where possible.
 */

import type {
  ChatMessage,
  AssistantMessage,
  ToolMessage,
} from '../providers/openai-compatible.js';
import type { ToolCall } from '../providers/types.js';

// ── Types ──────────────────────────────────────────────────

/** A single tool call entry with its result. */
export interface TranscriptToolCall {
  /** Tool call ID (matches tool_call_id in result) */
  id: string;
  /** Tool function name */
  name: string;
  /** Raw JSON arguments string */
  args: string;
  /** Tool result content (if available) */
  result: string | undefined;
  /** Execution duration in ms (estimated from timestamps if available) */
  durationMs: number | undefined;
}

/** A single entry in the transcript view. */
export interface TranscriptEntry {
  /** Unique key for React rendering */
  key: string;
  /** Message role */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text content */
  content: string;
  /** Tool calls made by the assistant (only for assistant messages) */
  toolCalls: TranscriptToolCall[];
  /** Timestamp (ISO string) if available */
  timestamp: string | undefined;
  /** Index in the original history array */
  index: number;
}

// ── Builder ────────────────────────────────────────────────

/**
 * Build structured transcript data from the agent history.
 *
 * Iterates through the ChatMessage array, pairing assistant
 * tool_calls with subsequent tool result messages. Each entry
 * gets a unique key, its role, content, and any associated
 * tool calls with their results.
 *
 * @param history The raw agent history (ChatMessage[])
 * @returns Structured TranscriptEntry[]
 */
export function buildTranscriptData(history: ChatMessage[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const toolResults = collectToolResults(history);

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];

    // Skip system messages
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : extractTextParts(msg.content);
      entries.push({
        key: `msg-${i}`,
        role: 'user',
        content,
        toolCalls: [],
        timestamp: undefined,
        index: i,
      });
    } else if (msg.role === 'assistant') {
      const assistant = msg as AssistantMessage;
      const content = typeof assistant.content === 'string'
        ? assistant.content
        : extractTextParts(assistant.content);

      // Pair tool calls with their results
      const toolCalls: TranscriptToolCall[] = (assistant.tool_calls ?? []).map(
        (tc: ToolCall) => {
          const result = toolResults.get(tc.id);
          return {
            id: tc.id,
            name: tc.function.name,
            args: tc.function.arguments,
            result: result?.content,
            durationMs: result?.durationMs,
          };
        },
      );

      entries.push({
        key: `msg-${i}`,
        role: 'assistant',
        content,
        toolCalls,
        timestamp: undefined,
        index: i,
      });
    }
    // Tool messages are consumed as results above; skip standalone display
  }

  return entries;
}

// ── Helpers ────────────────────────────────────────────────

interface ToolResultInfo {
  content: string;
  durationMs: number | undefined;
}

/**
 * Build a map of tool_call_id -> result content by scanning
 * the history for tool messages.
 */
function collectToolResults(history: ChatMessage[]): Map<string, ToolResultInfo> {
  const results = new Map<string, ToolResultInfo>();

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role !== 'tool') continue;

    const toolMsg = msg as ToolMessage;
    if (!toolMsg.tool_call_id) continue;

    // Estimate duration: look for the preceding assistant message
    // that emitted this tool call, and compute elapsed time.
    // Since we don't have real timestamps, we leave duration undefined
    // unless the message carries timing metadata.
    const durationMs = estimateDuration(history, i);

    results.set(toolMsg.tool_call_id, {
      content: toolMsg.content,
      durationMs,
    });
  }

  return results;
}

/**
 * Estimate tool call duration by scanning for timing metadata
 * in adjacent messages. Returns undefined if no timing data is found.
 *
 * Some tool results include a timing header like "[duration: 123ms]"
 * — we parse that if present.
 */
function estimateDuration(history: ChatMessage[], toolIndex: number): number | undefined {
  const msg = history[toolIndex];
  if (msg.role !== 'tool') return undefined;

  // Check for embedded timing in content
  const content = (msg as ToolMessage).content;
  const timingMatch = content.match(/\[duration:\s*(\d+)\s*ms\]/i);
  if (timingMatch) {
    return parseInt(timingMatch[1], 10);
  }

  return undefined;
}

/**
 * Extract text from an array of content parts.
 */
function extractTextParts(
  parts: Array<{ type: string; text?: string }>,
): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n');
}
