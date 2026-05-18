import type { SparkCLIConfig } from '../../config/schema.js';
import { SparkCLIError } from '../../utils/errors.js';
import { DEFAULT_BASE_URLS, normalizeBaseUrl } from './endpoints.js';
import { getProvider, resolveConfiguredApiKey, resolveCustomProviderApiKey } from './registry.js';
import {
  chatCompletion,
  pingModel,
  type ChatMessage,
} from './openai-compatible.js';
import { anthropicChatCompletion } from './anthropic.js';
import { isCloudKeysEnabled, getCloudEndpoint } from '../../cloud/config.js';
import { loadCloudSession } from '../../cloud/session.js';
import { cloudProxyChat, type CloudChatMessage } from '../../cloud/client.js';
import type { ProviderResponse, ToolDefinition } from './types.js';

export type LlmTask = 'chat' | 'gen' | 'ui' | 'vision' | 'embed' | 'level' | 'anim';

export interface ResolvedModel {
  providerId: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

function getCustomProvider(config: SparkCLIConfig, name: string) {
  return config.providers?.custom_providers?.find((p) => p.name === name);
}

export function resolveModelForTask(
  config: SparkCLIConfig,
  task: LlmTask,
  overrides?: { provider?: string; model?: string },
): ResolvedModel {
  const taskCfg = config.tasks?.[task];
  let providerId =
    overrides?.provider ??
    (taskCfg?.provider && taskCfg.provider !== 'inherit' ? taskCfg.provider : undefined) ??
    config.model?.provider ??
    'auto';
  let modelId =
    overrides?.model ??
    (taskCfg?.model && taskCfg.model !== 'inherit' ? taskCfg.model : undefined) ??
    config.model?.default;

  if (!modelId) {
    throw new SparkCLIError('No model configured.', 1, [
      'Run: spark-cli model use <provider>/<model>',
    ]);
  }

  if (providerId === 'auto') {
    const fb = config.providers?.fallback_providers?.slice().sort((a, b) => {
      return (a.priority ?? 99) - (b.priority ?? 99);
    })[0];
    if (fb?.name) {
      providerId = fb.name;
      if (fb.model) modelId = fb.model;
    } else {
      providerId = 'openai';
    }
  }

  const custom = getCustomProvider(config, providerId);
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (custom) {
    baseUrl = custom.base_url;
    const resolved = resolveCustomProviderApiKey(custom);
    apiKey = resolved.apiKey ?? '';
    if (resolved.keyEnvMisuse) {
      console.warn(
        `[spark-cli] provider "${providerId}": put the API key in api_key (config), not key_env. key_env is only for names like MIMO_API_KEY.`,
      );
    }
  } else {
    apiKey = resolveConfiguredApiKey(config, providerId);
    baseUrl =
      (config.model?.provider === providerId ? config.model?.base_url : undefined) ??
      DEFAULT_BASE_URLS[providerId] ??
      (providerId === 'ollama' ? process.env.OLLAMA_HOST ?? DEFAULT_BASE_URLS.ollama : undefined);
  }

  if (providerId === 'ollama') {
    const host = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
    baseUrl = normalizeBaseUrl(host);
    if (!baseUrl.endsWith('/v1')) baseUrl = `${baseUrl}/v1`;
    apiKey = apiKey ?? 'ollama';
  }

  if (!baseUrl) {
    throw new SparkCLIError(`Unknown provider: ${providerId}`, 1, [
      'Use a built-in provider or add providers.custom_providers in config',
    ]);
  }

  if (!apiKey && providerId !== 'ollama') {
    if (isCloudKeysEnabled(config)) {
      const session = loadCloudSession();
      if (session) {
        return {
          providerId,
          model: modelId,
          apiKey: session.accessToken,
          baseUrl: normalizeBaseUrl(getCloudEndpoint(config)),
        };
      }
    }
    const builtin = getProvider(providerId);
    throw new SparkCLIError(`Missing API key for provider: ${providerId}`, 2, [
      builtin ? `Set environment variable ${builtin.envKey}` : 'Check custom provider api_key or key_env',
      'Or: spark-cli cloud login && spark-cli cloud keys use',
    ]);
  }

  // OpenAI-compatible gateways often require exact lowercase model ids.
  const model = modelId.includes('/') ? modelId : modelId.toLowerCase();

  return {
    providerId,
    model,
    apiKey: apiKey ?? '',
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

/**
 * Convert a canonical `ChatMessage` (which may carry `tool_calls` or be a
 * `tool` role) to the cloud-proxy wire shape. Preserves tool fields rather
 * than silently dropping them via `JSON.stringify`.
 */
function toCloudMessage(m: ChatMessage): CloudChatMessage {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      content: m.content,
      tool_call_id: m.tool_call_id,
    };
  }
  if (m.role === 'assistant') {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const out: CloudChatMessage = { role: 'assistant', content };
    if (m.tool_calls && m.tool_calls.length > 0) out.tool_calls = m.tool_calls;
    return out;
  }
  const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  return { role: m.role, content };
}

export async function completeChat(
  resolved: ResolvedModel,
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    config?: SparkCLIConfig;
    tools?: ToolDefinition[];
    toolChoice?: 'auto' | 'none' | 'required';
    /**
     * Optional streaming callback. Only honored by the OpenAI-compatible
     * branch right now; Anthropic and cloud-proxy fall back to non-streaming
     * silently so callers don't have to special-case providers.
     */
    onDelta?: (delta: string) => void;
  },
): Promise<ProviderResponse> {
  return withRetry(() => completeChatOnce(resolved, messages, options));
}

const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isTransient(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  // SparkCLIError surfaces status as "LLM API error (NNN): ..."
  const m = msg.match(/LLM API error \((\d{3})\)/);
  if (m) {
    const code = Number.parseInt(m[1] ?? '0', 10);
    if (TRANSIENT_STATUS_CODES.has(code)) return true;
  }
  // Network-level transient errors
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up/i.test(msg)) {
    return true;
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts || !isTransient(e)) throw e;
      const delay = baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function completeChatOnce(
  resolved: ResolvedModel,
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    config?: SparkCLIConfig;
    tools?: ToolDefinition[];
    toolChoice?: 'auto' | 'none' | 'required';
    onDelta?: (delta: string) => void;
  },
): Promise<ProviderResponse> {
  const config = options?.config;
  if (config && isCloudKeysEnabled(config)) {
    const session = loadCloudSession();
    if (session) {
      return cloudProxyChat({
        providerId: resolved.providerId,
        model: resolved.model,
        messages: messages.map(toCloudMessage),
        maxTokens: options?.maxTokens,
        tools: options?.tools,
        toolChoice: options?.toolChoice,
        token: session.accessToken,
        baseUrl: getCloudEndpoint(config),
      });
    }
  }

  if (resolved.providerId === 'anthropic') {
    return anthropicChatCompletion({
      apiKey: resolved.apiKey,
      model: resolved.model,
      messages,
      maxTokens: options?.maxTokens,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
    });
  }

  return chatCompletion({
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    model: resolved.model,
    messages,
    maxTokens: options?.maxTokens,
    tools: options?.tools,
    toolChoice: options?.toolChoice,
    providerId: resolved.providerId,
    onDelta: options?.onDelta,
  });
}

export async function testResolvedModel(
  resolved: ResolvedModel,
  config?: SparkCLIConfig,
): Promise<void> {
  if (config && isCloudKeysEnabled(config)) {
    const session = loadCloudSession();
    if (session) {
      await cloudProxyChat({
        providerId: resolved.providerId,
        model: resolved.model,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        maxTokens: 16,
        token: session.accessToken,
        baseUrl: getCloudEndpoint(config),
      });
      return;
    }
  }

  if (resolved.providerId === 'anthropic') {
    await anthropicChatCompletion({
      apiKey: resolved.apiKey,
      model: resolved.model,
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      maxTokens: 16,
    });
    return;
  }
  await pingModel({
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    model: resolved.model,
  });
}
