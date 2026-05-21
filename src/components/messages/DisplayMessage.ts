/**
 * DisplayMessage — extended message type for the UI layer.
 *
 * Includes all ChatMessage types plus display-only types
 * (progress, thinking) that are never sent to the provider
 * but are shown in the message list.
 *
 * This separation ensures the provider pipeline only handles
 * wire-format messages while the UI can show richer content.
 */

import type { ChatMessage } from '../../core/providers/openai-compatible.js';

/** Display-only progress indicator message */
export interface ProgressDisplayMessage {
  role: 'progress';
  label: string;
  current?: number;
  total?: number;
  percent?: number;
  status?: string;
}

/**
 * Union type for all messages that can appear in the UI.
 * Extends ChatMessage with display-only types.
 */
export type DisplayMessage = ChatMessage | ProgressDisplayMessage;

/**
 * Type guard for progress display messages.
 */
export function isProgressMessage(msg: DisplayMessage): msg is ProgressDisplayMessage {
  return msg.role === 'progress';
}
