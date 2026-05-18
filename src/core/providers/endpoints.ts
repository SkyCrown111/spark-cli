/** Default OpenAI-compatible API base URLs per built-in provider. */
export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
  ollama: 'http://127.0.0.1:11434/v1',
};

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
