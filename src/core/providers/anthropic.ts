import { request } from 'undici';
import { SparkCLIError } from '../../utils/errors.js';
import type { ChatMessage } from './openai-compatible.js';
import type {
  ProviderResponse,
  ProviderStopReason,
  ToolCall,
  ToolDefinition,
} from './types.js';

/**
 * Anthropic Messages API content blocks.
 * - `text`: prose content.
 * - `tool_use`: model requested a tool call (~ OpenAI `tool_calls[]`).
 * - `tool_result`: prior tool call's result, sent as a `user` message.
 */
type AnthropicTextBlock = { type: 'text'; text: string };
type AnthropicToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | { type: 'thinking'; thinking: string };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

function mapStopReason(r: string | undefined): ProviderStopReason | undefined {
  switch (r) {
    case 'end_turn':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop';
    case undefined:
      return undefined;
    default:
      return 'other';
  }
}

/**
 * Translate canonical `ChatMessage[]` (OpenAI shape) to Anthropic's
 * content-block format.
 *
 * Rules:
 * - `system` is hoisted to top-level `system`, not in `messages`.
 * - `assistant` with `tool_calls` becomes assistant content blocks: optional
 *   leading `text`, followed by one `tool_use` block per call.
 * - `tool` (role) becomes a `user` message with a single `tool_result` block.
 * - Consecutive same-role messages are collapsed (Anthropic disallows them
 *   adjacent), in particular merging consecutive `tool_result` user messages.
 */
function translateOutgoing(messages: ChatMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const out: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      const sys = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      system = system ? `${system}\n\n${sys}` : sys;
      continue;
    }

    if (m.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = [];
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (text && text.trim().length > 0) blocks.push({ type: 'text', text });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            input = tc.function.arguments
              ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
              : {};
          } catch {
            // If arguments aren't valid JSON, pass them as a raw string field
            // so the model sees what it produced rather than silently dropping.
            input = { _raw: tc.function.arguments };
          }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
      }
      out.push({
        role: 'assistant',
        content: blocks.length > 0 ? blocks : '',
      });
      continue;
    }

    if (m.role === 'tool') {
      const block: AnthropicToolResultBlock = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: m.content,
      };
      // Merge with previous user message so adjacent tool_results coalesce.
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }

    // user
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const last = out[out.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      last.content.push({ type: 'text', text: content });
    } else {
      out.push({ role: 'user', content });
    }
  }

  return { system, messages: out };
}

/**
 * Translate Anthropic response content blocks back to canonical
 * `ProviderResponse`. Text blocks concatenate into `content`; `tool_use`
 * blocks become `tool_calls[]`.
 */
function translateIncoming(json: {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}): ProviderResponse {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const c of json.content ?? []) {
    if (c.type === 'text') {
      textParts.push(c.text);
    } else if (c.type === 'tool_use') {
      toolCalls.push({
        id: c.id,
        type: 'function',
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input ?? {}),
        },
      });
    } else if ((c as { type: string }).type === 'thinking') {
      thinkingParts.push((c as { type: 'thinking'; thinking: string }).thinking ?? '');
    }
  }
  const content = textParts.join('').trim();
  const thinking = thinkingParts.join('').trim() || undefined;
  if (!content && !thinking && toolCalls.length === 0) {
    throw new SparkCLIError('Anthropic returned empty response', 4);
  }
  return {
    content: content || thinking || '',
    thinking,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    stop_reason: mapStopReason(json.stop_reason),
    usage: {
      prompt_tokens: json.usage?.input_tokens,
      completion_tokens: json.usage?.output_tokens,
    },
  };
}

/** Convert OpenAI-shape tool definitions to Anthropic's `{name, description, input_schema}`. */
function translateTools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

export async function anthropicChatCompletion(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
}): Promise<ProviderResponse> {
  const { system, messages: anthropicMessages } = translateOutgoing(opts.messages);

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: anthropicMessages,
  };
  if (system) body.system = system;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = translateTools(opts.tools);
    if (opts.toolChoice === 'required') {
      body.tool_choice = { type: 'any' };
    } else if (opts.toolChoice === 'none') {
      // Anthropic has no explicit `none`; omit tools to disable.
      delete body.tools;
    } else {
      body.tool_choice = { type: 'auto' };
    }
  }

  const res = await request('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  });

  const text = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new SparkCLIError(`Anthropic API error (${res.statusCode}): ${text.slice(0, 400)}`, 4);
  }

  const json = JSON.parse(text) as {
    content?: AnthropicContentBlock[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return translateIncoming(json);
}

// Exported for unit tests.
export const __test = { translateOutgoing, translateIncoming, translateTools };
