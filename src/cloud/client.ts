import { request } from 'undici';
import type { CloudSession, DeviceAuthStart } from './types.js';
import { DEFAULT_CLOUD_ENDPOINT } from './paths.js';
import type {
  ProviderResponse,
  ProviderStopReason,
  ToolCall,
  ToolDefinition,
} from '../core/providers/types.js';

/**
 * Wire shape sent to the cloud proxy. Mirrors `ChatMessage` (OpenAI shape) so
 * tool_calls and tool results round-trip through the proxy without loss.
 * Kept structurally identical to `src/core/providers/openai-compatible.ts`'s
 * `ChatMessage` to avoid translation at the cloud boundary.
 */
export interface CloudChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

function endpoint(base?: string): string {
  return (base ?? DEFAULT_CLOUD_ENDPOINT).replace(/\/$/, '');
}

async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    baseUrl?: string;
  } = {},
): Promise<T> {
  const url = `${endpoint(options.baseUrl)}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await request(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(text || `Cloud API ${res.statusCode}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function cloudStartDeviceAuth(
  baseUrl?: string,
  autoApprove = false,
): Promise<DeviceAuthStart> {
  return api<DeviceAuthStart>('/v1/auth/device', {
    method: 'POST',
    baseUrl,
    body: { auto_approve: autoApprove },
  });
}

export async function cloudPollDeviceToken(
  deviceCode: string,
  baseUrl?: string,
): Promise<CloudSession | null> {
  try {
    return await api<CloudSession>('/v1/auth/token', {
      method: 'POST',
      body: { device_code: deviceCode },
      baseUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('authorization_pending')) return null;
    throw e;
  }
}

export async function cloudSetKey(
  provider: string,
  apiKey: string,
  token: string,
  baseUrl?: string,
): Promise<void> {
  await api(`/v1/keys/${encodeURIComponent(provider)}`, {
    method: 'PUT',
    body: { api_key: apiKey },
    token,
    baseUrl,
  });
}

export async function cloudListKeys(
  token: string,
  baseUrl?: string,
): Promise<{ keys: { provider: string; last4?: string; setAt: string }[] }> {
  return api('/v1/keys', { token, baseUrl });
}

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

export async function cloudProxyChat(opts: {
  providerId: string;
  model: string;
  messages: CloudChatMessage[];
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  token: string;
  baseUrl?: string;
}): Promise<ProviderResponse> {
  const path = `/v1/proxy/${encodeURIComponent(opts.providerId)}/chat/completions`;
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? 'auto';
  }
  const result = await api<{
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
      finish_reason?: string;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }>(path, {
    method: 'POST',
    token: opts.token,
    baseUrl: opts.baseUrl,
    body,
  });
  const choice = result.choices?.[0];
  const message = choice?.message;
  const toolCalls = message?.tool_calls;
  const content = (typeof message?.content === 'string' ? message.content : '') ?? '';
  return {
    content,
    tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    stop_reason: mapFinishReason(choice?.finish_reason),
    usage: result.usage,
  };
}

export async function cloudPushSync(
  projectId: string,
  files: Record<string, string>,
  token: string,
  baseUrl?: string,
): Promise<{ revision: string; count: number }> {
  return api('/v1/sync/push', {
    method: 'POST',
    token,
    baseUrl,
    body: { project_id: projectId, files },
  });
}

export async function cloudPullSync(
  projectId: string,
  token: string,
  baseUrl?: string,
): Promise<{ revision: string; files: Record<string, string> }> {
  return api(`/v1/sync/pull?project_id=${encodeURIComponent(projectId)}`, {
    token,
    baseUrl,
  });
}

export async function cloudAppendAudit(
  projectId: string,
  event: Record<string, unknown>,
  token: string,
  baseUrl?: string,
): Promise<void> {
  await api('/v1/audit/replay', {
    method: 'POST',
    token,
    baseUrl,
    body: { project_id: projectId, event },
  });
}
