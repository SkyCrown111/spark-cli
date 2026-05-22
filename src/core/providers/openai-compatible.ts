import { request } from 'undici';
import { SparkCLIError } from '../../utils/errors.js';
import { normalizeBaseUrl } from './endpoints.js';
import type {
  ProviderResponse,
  ProviderStopReason,
  ToolCall,
  ToolDefinition,
} from './types.js';
import { demoteTools, isToolRelated4xx } from './capabilities.js';

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  | { type: 'thinking'; text: string };

/**
 * Discriminated-union message shape. The OpenAI wire format is canonical
 * in-process; Anthropic translates at the provider boundary.
 *
 * - `assistant` may carry `tool_calls` when the model requested a tool.
 * - `tool` carries the result content, keyed back to the call by `tool_call_id`.
 */
export interface SystemMessage {
  role: 'system';
  content: string | ChatContentPart[];
}
export interface UserMessage {
  role: 'user';
  content: string | ChatContentPart[];
}
export interface AssistantMessage {
  role: 'assistant';
  content: string | ChatContentPart[];
  tool_calls?: ToolCall[];
}
export interface ToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export interface ChatCompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Tool definitions exposed to the model. Capability-gated by callers. */
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  /** Identifier used by the capability cache for lazy demotion. */
  providerId?: string;
  /**
   * If provided, request is sent with `stream:true` and SSE chunks are parsed
   * incrementally. `onDelta` fires for each content fragment as it arrives.
   * The returned `ProviderResponse` is still the fully assembled final result,
   * so callers don't need to special-case streaming downstream.
   */
  onDelta?: (delta: string) => void;
  /** Reasoning effort level (low/medium/high/xhigh/max). Passed as reasoning_effort for supported models. */
  effortLevel?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** @deprecated Use `ProviderResponse` from `./types.js`. */
export type ChatCompletionResult = ProviderResponse;

function mapFinishReason(r: string | undefined): ProviderStopReason | undefined {
  switch (r) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case undefined:
      return undefined;
    default:
      return 'other';
  }
}

function buildMessagesPayload(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id };
    }
    if (m.role === 'assistant') {
      const out: Record<string, unknown> = { role: 'assistant', content: m.content ?? '' };
      if (m.tool_calls && m.tool_calls.length > 0) {
        out.tool_calls = m.tool_calls;
      }
      return out;
    }
    return { role: m.role, content: m.content };
  });
}

export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ProviderResponse> {
  if (opts.onDelta) {
    return chatCompletionStream(opts);
  }
  const url = `${normalizeBaseUrl(opts.baseUrl)}/chat/completions`;
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: buildMessagesPayload(opts.messages),
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.2,
    stream: false,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? 'auto';
  }
  if (opts.effortLevel && opts.effortLevel !== 'medium') {
    body.reasoning_effort = opts.effortLevel;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.apiKey && opts.apiKey !== 'ollama') {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const res = await request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  });

  const text = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    let detail = text.slice(0, 500);
    try {
      const err = JSON.parse(text) as { error?: { message?: string } };
      detail = err.error?.message ?? detail;
    } catch {
      /* keep raw */
    }
    // Demote tool capability if a tool-related 4xx came back.
    if (opts.tools && opts.tools.length > 0 && isToolRelated4xx(res.statusCode, text)) {
      demoteTools(
        {
          providerId: opts.providerId ?? 'openai-compatible',
          baseUrl: normalizeBaseUrl(opts.baseUrl),
          model: opts.model,
        },
        detail,
      );
    }
    throw new SparkCLIError(`LLM API error (${res.statusCode}): ${detail}`, 4);
  }

  const json = JSON.parse(text) as {
    choices?: {
      message?: {
        content?: string | null;
        reasoning_content?: string;
        tool_calls?: ToolCall[];
      };
      finish_reason?: string;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = json.choices?.[0];
  const message = choice?.message;
  const toolCalls = message?.tool_calls;
  const rawContent =
    (typeof message?.content === 'string' ? message.content : '').trim();
  const thinking = (message?.reasoning_content ?? '').trim() || undefined;

  // Empty content is valid when the model only emits tool_calls.
  if (!rawContent && !thinking && (!toolCalls || toolCalls.length === 0)) {
    throw new SparkCLIError('LLM returned empty response', 4);
  }

  return {
    content: rawContent || thinking || '',
    thinking,
    tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    stop_reason: mapFinishReason(choice?.finish_reason),
    usage: json.usage,
  };
}

/** Minimal connectivity check. */
export async function pingModel(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<void> {
  await chatCompletion({
    ...opts,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    maxTokens: 16,
  });
}

/**
 * Streaming variant. Sends `stream:true`, parses SSE `data:` frames, fires
 * `onDelta` for each content fragment, and returns the assembled
 * ProviderResponse so the agent loop sees the same shape as non-streaming.
 *
 * Tool-call streaming follows OpenAI's `delta.tool_calls[].function.arguments`
 * pattern: each frame appends to the call at the matching `index`.
 */
async function chatCompletionStream(
  opts: ChatCompletionOptions,
): Promise<ProviderResponse> {
  const url = `${normalizeBaseUrl(opts.baseUrl)}/chat/completions`;
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: buildMessagesPayload(opts.messages),
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.2,
    stream: true,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? 'auto';
  }
  if (opts.effortLevel && opts.effortLevel !== 'medium') {
    body.reasoning_effort = opts.effortLevel;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (opts.apiKey && opts.apiKey !== 'ollama') {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const res = await request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    headersTimeout: 120_000,
    bodyTimeout: 0,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const text = await res.body.text();
    let detail = text.slice(0, 500);
    try {
      const errJson = JSON.parse(text) as { error?: { message?: string } };
      detail = errJson.error?.message ?? detail;
    } catch {
      /* keep raw */
    }
    if (opts.tools && opts.tools.length > 0 && isToolRelated4xx(res.statusCode, text)) {
      demoteTools(
        {
          providerId: opts.providerId ?? 'openai-compatible',
          baseUrl: normalizeBaseUrl(opts.baseUrl),
          model: opts.model,
        },
        detail,
      );
    }
    throw new SparkCLIError(`LLM API error (${res.statusCode}): ${detail}`, 4);
  }

  let assembledContent = '';
  let assembledThinking: string | undefined;
  const toolCalls: ToolCall[] = [];
  let finishReason: string | undefined;
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

  let buffered = '';
  for await (const chunk of res.body as AsyncIterable<Buffer>) {
    buffered += chunk.toString('utf8');
    let nlIdx: number;
    while ((nlIdx = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, nlIdx).replace(/\r$/, '');
      buffered = buffered.slice(nlIdx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let evt: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: 'function';
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = evt.choices?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta = choice?.delta as any;
      if (delta?.content) {
        assembledContent += delta.content;
        try {
          opts.onDelta?.(delta.content);
        } catch {
          /* don't let renderer errors abort the stream */
        }
      }
      if (delta?.reasoning_content) {
        assembledThinking = (assembledThinking ?? '') + delta.reasoning_content;
      }
      if (delta?.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index;
          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: tcDelta.id ?? '',
              type: 'function',
              function: {
                name: tcDelta.function?.name ?? '',
                arguments: tcDelta.function?.arguments ?? '',
              },
            };
          } else {
            const cur = toolCalls[idx];
            if (tcDelta.id) cur.id = tcDelta.id;
            if (tcDelta.function?.name) cur.function.name = tcDelta.function.name;
            if (tcDelta.function?.arguments) {
              cur.function.arguments += tcDelta.function.arguments;
            }
          }
        }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (evt.usage) usage = evt.usage;
    }
  }

  const trimmedContent = assembledContent.trim();
  const trimmedThinking = assembledThinking?.trim() || undefined;
  const cleanedToolCalls = toolCalls.filter(Boolean);
  if (!trimmedContent && !trimmedThinking && cleanedToolCalls.length === 0) {
    throw new SparkCLIError('LLM returned empty response', 4);
  }

  return {
    content: trimmedContent || trimmedThinking || '',
    thinking: trimmedThinking,
    tool_calls: cleanedToolCalls.length > 0 ? cleanedToolCalls : undefined,
    stop_reason: mapFinishReason(finishReason),
    usage,
  };
}
