import type { SparkCLIConfig } from '../../config/schema.js';

export interface ProviderInfo {
  id: string;
  label: string;
  envKey: string;
  exampleModels: string[];
}

export const BUILTIN_PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    exampleModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    exampleModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    exampleModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    envKey: 'GOOGLE_API_KEY',
    exampleModels: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  },
  {
    id: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    exampleModels: ['llama-3.3-70b-versatile'],
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    envKey: 'OLLAMA_HOST',
    exampleModels: ['llama3.2', 'qwen2.5'],
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.id === id);
}

/** Env var names are UPPER_SNAKE_CASE; secrets must not go in key_env. */
export function isEnvVarName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/** Normalize user input like `baidu_api_key` → `BAIDU_API_KEY`. */
export function normalizeEnvVarName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return '';
  return cleaned.toUpperCase();
}

/** Heuristic: user pasted a secret token instead of an env var name. */
export function looksLikePastedApiKey(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (isEnvVarName(s)) return false;
  if (/^(sk|pk|api|tp|bce)-/i.test(s)) return true;
  if (s.length >= 24 && /[a-z]/.test(s) && /[0-9]/.test(s)) return true;
  return false;
}

export function suggestEnvVarNameForProvider(providerId: string): string {
  const base = normalizeEnvVarName(providerId) || 'SPARK_CLI';
  return base.endsWith('_API_KEY') ? base : `${base}_API_KEY`;
}

export function resolveCustomProviderApiKey(custom: {
  api_key?: string;
  key_env?: string;
}): { apiKey?: string; keyEnvMisuse?: boolean } {
  if (custom.api_key?.trim()) {
    return { apiKey: custom.api_key.trim() };
  }
  const keyEnv = custom.key_env?.trim();
  if (!keyEnv) {
    return {};
  }
  if (isEnvVarName(keyEnv)) {
    const fromEnv = process.env[keyEnv];
    return fromEnv ? { apiKey: fromEnv } : {};
  }
  // User pasted the secret into key_env — treat as api_key but flag for config fix.
  return { apiKey: keyEnv, keyEnvMisuse: true };
}

export function resolveApiKey(providerId: string): string | undefined {
  const p = getProvider(providerId);
  if (!p) return undefined;
  if (providerId === 'ollama') {
    return process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  }
  return process.env[p.envKey];
}

export function resolveConfiguredApiKey(
  config: SparkCLIConfig,
  providerId: string,
): string | undefined {
  const custom = config.providers?.custom_providers?.find((p) => p.name === providerId);
  if (custom) {
    return resolveCustomProviderApiKey(custom).apiKey;
  }

  if (config.model?.provider === providerId && config.model.api_key?.trim()) {
    return config.model.api_key.trim();
  }

  return resolveApiKey(providerId);
}

export function formatModelRef(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function parseModelRef(ref: string): { provider: string; model: string } {
  const slash = ref.indexOf('/');
  if (slash === -1) {
    return { provider: 'auto', model: ref };
  }
  return {
    provider: ref.slice(0, slash),
    model: ref.slice(slash + 1),
  };
}
