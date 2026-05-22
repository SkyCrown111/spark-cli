/**
 * Session serializer — saves and loads REPL conversation state.
 *
 * Sessions are stored as JSON files at `.spark-cli/sessions/<id>.json`.
 * Each session captures the conversation history, permission state,
 * write mode, model, and metadata.
 *
 * Design notes:
 * - ChatMessage includes `tool_calls` (with full ToolCall objects) and
 *   `tool_call_id` which are all JSON-serializable.
 * - ToolPermissionSession stores its always-allow set as a string array.
 * - The `function.arguments` field on ToolCall is a JSON string, not parsed —
 *   so it round-trips cleanly.
 * - System messages are stripped from history before saving (they're rebuilt
 *   on load from the system prompt builder).
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type { ToolWriteMode } from '../agent/tool-registry.js';
import type { PermissionMode } from '../../state/AppState.js';
import type { PlanState } from '../slash/plan-mode.js';
import type { EffortLevel } from '../../state/AppState.js';

export interface SessionSnapshot {
  /** Unique session identifier. */
  id: string;
  /** Project root this session belongs to. */
  projectRoot: string;
  /** User-defined session name (optional, set via --name or /rename). */
  name?: string;
  /** Conversation history (without system messages). */
  history: ChatMessage[];
  /** Display messages (user + assistant prose). */
  messages: ChatMessage[];
  /** Write mode at time of save. */
  writeMode: ToolWriteMode;
  /** Permission mode at time of save. */
  permissionMode: PermissionMode;
  /** Effort level at time of save. */
  effortLevel: EffortLevel;
  /** Tools in the "always allow" set. */
  alwaysAllowSet: string[];
  /** Plan state at time of save. */
  plan: PlanState;
  /** Model used in this session. */
  model: string;
  /** Session title (derived from first user message or plan). */
  title: string;
  /** When this session was created. */
  startedAt: string;
  /** When this session was last saved. */
  updatedAt: string;
}

export function serializeSession(snapshot: SessionSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function deserializeSession(raw: string): SessionSnapshot {
  const data = JSON.parse(raw) as SessionSnapshot;
  // Basic validation: ensure required fields exist
  if (!data.id || !data.history || !data.projectRoot) {
    throw new Error(`Invalid session data: missing required fields`);
  }
  // Ensure date fields exist
  data.startedAt = data.startedAt ?? new Date().toISOString();
  data.updatedAt = data.updatedAt ?? data.startedAt;
  data.title = data.title ?? 'Untitled session';
  data.writeMode = data.writeMode ?? 'staging';
  data.permissionMode = data.permissionMode ?? 'default';
  data.effortLevel = data.effortLevel ?? 'medium';
  data.alwaysAllowSet = data.alwaysAllowSet ?? [];
  data.plan = data.plan ?? { phase: 'normal' };
  data.messages = data.messages ?? [];
  data.model = data.model ?? 'unknown';
  return data;
}