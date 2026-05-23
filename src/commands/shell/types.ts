/**
 * Shared types for the shell REPL modules.
 */

import type { ChatMessage } from '../../core/providers/openai-compatible.js';
import type { ToolWriteMode } from '../../core/agent/tool-registry.js';
import type { PlanState } from '../../core/slash/plan-mode.js';
import type { ToolPermissionSession } from '../../core/agent/tool-permissions.js';

export interface ShellState {
  history: ChatMessage[];
  writeMode: ToolWriteMode;
  plan: PlanState;
  toolPermissionSession: ToolPermissionSession;
  /** Token usage info for the status line. */
  tokenUsage?: { used: number; budget: number };
  /** Current session ID for persistence. */
  sessionId?: string;
  /** Session title (derived from first user message). */
  sessionTitle?: string;
  /** Current checkpoint for rewind. */
  checkpoint?: { id: string; timestamp: string };
}
