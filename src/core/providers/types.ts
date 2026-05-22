/**
 * Canonical provider-facing types for tool-use enabled chat completions.
 *
 * The in-process shape is OpenAI's. Anthropic's content-block tool_use protocol
 * is translated at the provider boundary in `anthropic.ts`. The cloud proxy
 * passes the OpenAI shape through to whatever provider it routes to.
 */

/** OpenAI-style tool call emitted by the model. `arguments` is a JSON string. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Tool definition exposed to the model in the request body. */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    /** JSON Schema describing the tool arguments. */
    parameters: Record<string, unknown>;
  };
}

/** What the model decided to do at the end of a generation. */
export type ProviderStopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'stop'
  | 'length'
  | 'other';

/**
 * Unified result returned by every provider call path.
 * - `content` is always a string. Empty string is valid when the model only
 *   emitted tool calls (some providers send `null` on the wire; we normalize).
 * - `tool_calls` is present only when the model wants to call tools.
 * - `stop_reason` lets the agent loop know whether to dispatch tools or stop.
 */
export interface ProviderResponse {
  content: string;
  /** Chain-of-thought / reasoning content (o1-style, DeepSeek, etc.) */
  thinking?: string;
  tool_calls?: ToolCall[];
  stop_reason?: ProviderStopReason;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/** Per-provider feature flags, populated lazily. */
export interface ProviderCapabilities {
  /** Whether the provider accepts the `tools` parameter and emits `tool_calls`. */
  tools: boolean;
}

/**
 * `provider.toolsMode` config:
 * - `auto` (default): probe; demote on first tool-related 4xx so the agent
 *   surfaces the gateway error rather than retrying forever.
 * - `native`: assume tools work; surface errors to the user.
 * - `fallback`: never send `tools`; only useful for diagnosing legacy gateways.
 */
export type ToolsMode = 'auto' | 'native' | 'fallback';
