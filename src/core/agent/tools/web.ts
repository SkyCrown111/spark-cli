/**
 * web_fetch / web_search: outbound HTTP for the agent.
 *
 * Disabled by default — operators must opt in via `tools.web.enabled = true`
 * in their config. This is intentional: AI agents pulling unaudited content
 * from the network is a real prompt-injection vector. When enabled, host
 * allow/block lists narrow the surface further.
 *
 * web_fetch
 *   - GETs the URL, normalises HTML→text via a tiny tag stripper.
 *   - Caps body at `tools.web.maxBytes` (default 256 KB).
 *   - Returns `[FETCHED] <url>` plus the body, plus the resolved status.
 *   - Refuses non-http(s), file://, and hosts blocked by config.
 *
 * web_search
 *   - Uses the DuckDuckGo "html" endpoint (no API key) and parses titles +
 *     snippets + links from the result page.
 *   - `searchBackend = 'none'` disables search even when web_fetch is on.
 *
 * Both tools treat fetched content as untrusted. The agent must still apply
 * judgement; instructions embedded in fetched pages are *not* operator intent.
 */

import { setTimeout as delay } from 'node:timers/promises';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const MAX_RESULTS = 10;

interface WebSettings {
  enabled: boolean;
  timeoutMs: number;
  maxBytes: number;
  allowHosts: string[];
  blockHosts: string[];
  searchBackend: 'ddg' | 'none';
}

function readSettings(ctx: ToolContext): WebSettings {
  const w = ctx.config.tools?.web;
  return {
    enabled: w?.enabled === true,
    timeoutMs: typeof w?.timeoutMs === 'number' && w.timeoutMs > 0 ? w.timeoutMs : DEFAULT_TIMEOUT_MS,
    maxBytes: typeof w?.maxBytes === 'number' && w.maxBytes > 0 ? w.maxBytes : DEFAULT_MAX_BYTES,
    allowHosts: Array.isArray(w?.allowHosts) ? w.allowHosts : [],
    blockHosts: Array.isArray(w?.blockHosts) ? w.blockHosts : [],
    searchBackend: w?.searchBackend ?? 'ddg',
  };
}

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().trim();
  if (!p) return false;
  if (p.startsWith('*.')) return h === p.slice(2) || h.endsWith(p.slice(1));
  return h === p || h.endsWith(`.${p}`);
}

function gateUrl(url: URL, s: WebSettings): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `unsupported protocol: ${url.protocol}`;
  }
  const host = url.hostname;
  if (s.blockHosts.some((p) => hostMatches(host, p))) {
    return `host "${host}" is blocked by tools.web.blockHosts`;
  }
  if (s.allowHosts.length > 0 && !s.allowHosts.some((p) => hostMatches(host, p))) {
    return `host "${host}" not in tools.web.allowHosts`;
  }
  return null;
}

async function fetchWithCaps(
  url: string,
  s: WebSettings,
  abortSignal?: AbortSignal,
): Promise<{ status: number; finalUrl: string; body: string; truncated: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), s.timeoutMs);
  // Bridge the parent abort into ours.
  const onParent = (): void => controller.abort();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', onParent, { once: true });
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'spark-cli-agent/0.2 (+web_fetch)' },
    });
    const buf = new Uint8Array(s.maxBytes);
    let written = 0;
    let truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      while (written < s.maxBytes) {
        const { value, done } = await reader.read();
        if (done) break;
        const remaining = s.maxBytes - written;
        if (value.length > remaining) {
          buf.set(value.subarray(0, remaining), written);
          written += remaining;
          truncated = true;
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        buf.set(value, written);
        written += value.length;
      }
    }
    const body = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, written));
    return { status: res.status, finalUrl: res.url || url, body, truncated };
  } finally {
    clearTimeout(timer);
    if (abortSignal) abortSignal.removeEventListener('abort', onParent);
  }
}

function htmlToText(html: string): string {
  // Drop script/style blocks first, then strip remaining tags.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  return stripped.trim();
}

async function fetchHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const settings = readSettings(ctx);
  if (!settings.enabled) {
    return {
      content: 'web_fetch is disabled. Set `tools.web.enabled: true` in your config to enable outbound HTTP.',
      isError: true,
    };
  }
  if (typeof args.url !== 'string' || args.url.length === 0) {
    return { content: 'web_fetch: `url` must be a non-empty string', isError: true };
  }
  let parsed: URL;
  try {
    parsed = new URL(args.url);
  } catch {
    return { content: `web_fetch: invalid URL "${args.url}"`, isError: true };
  }
  const gate = gateUrl(parsed, settings);
  if (gate) return { content: `web_fetch: ${gate}`, isError: true };

  const asText = args.format !== 'raw';
  try {
    const r = await fetchWithCaps(parsed.toString(), settings, ctx.abortSignal);
    const body = asText ? htmlToText(r.body) : r.body;
    const header = `[FETCHED ${r.status}] ${r.finalUrl}${r.truncated ? ' (truncated)' : ''}`;
    return {
      content: body ? `${header}\n\n${body}` : header,
      isError: r.status >= 400,
      structured: {
        status: r.status,
        finalUrl: r.finalUrl,
        truncated: r.truncated,
        bytes: r.body.length,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `web_fetch: ${msg}`, isError: true };
  }
}

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function parseDdg(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  // DDG html result anchors: <a class="result__a" href="…">Title</a>
  // followed by <a class="result__snippet">snippet text</a>.
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < MAX_RESULTS) {
    const rawUrl = m[1] ?? '';
    let url = rawUrl;
    // DDG wraps real URLs as /l/?uddg=<encoded>
    const uddg = /[?&]uddg=([^&]+)/.exec(rawUrl);
    if (uddg) {
      try { url = decodeURIComponent(uddg[1]!); } catch { /* keep raw */ }
    }
    const title = htmlToText(m[2] ?? '');
    const snippet = htmlToText(m[3] ?? '');
    if (title && url) hits.push({ title, url, snippet });
  }
  return hits;
}

async function searchHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const settings = readSettings(ctx);
  if (!settings.enabled) {
    return {
      content: 'web_search is disabled. Set `tools.web.enabled: true` in your config to enable outbound HTTP.',
      isError: true,
    };
  }
  if (settings.searchBackend === 'none') {
    return { content: 'web_search backend is set to "none".', isError: true };
  }
  if (typeof args.query !== 'string' || args.query.trim().length === 0) {
    return { content: 'web_search: `query` must be a non-empty string', isError: true };
  }
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(args.query.trim())}`;
  try {
    const r = await fetchWithCaps(url, settings, ctx.abortSignal);
    if (r.status >= 400) {
      return { content: `web_search: ddg returned ${r.status}`, isError: true };
    }
    const hits = parseDdg(r.body);
    if (hits.length === 0) {
      // DDG sometimes rate-limits and returns the bare html shell. Soft-retry once.
      await delay(500);
      const retry = await fetchWithCaps(url, settings, ctx.abortSignal);
      const hits2 = parseDdg(retry.body);
      if (hits2.length === 0) {
        return { content: `web_search: no results for "${args.query}"`, structured: { hits: [] } };
      }
      return formatSearch(args.query, hits2);
    }
    return formatSearch(args.query, hits);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `web_search: ${msg}`, isError: true };
  }
}

function formatSearch(query: string, hits: SearchHit[]): ToolResult {
  const lines: string[] = [`Search: ${query}`];
  hits.forEach((h, i) => {
    lines.push(`\n${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`);
  });
  return { content: lines.join('\n'), structured: { hits } };
}

export const webFetchTool: RegisteredTool = {
  name: 'web_fetch',
  description:
    'Fetch a URL via HTTP(S) and return the response body (HTML stripped to text by default). Disabled unless `tools.web.enabled` is true. Subject to host allow/block lists, 15s timeout, and 256 KB cap.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL to fetch.' },
      format: {
        type: 'string',
        enum: ['text', 'raw'],
        description: 'How to return the body. "text" (default) strips HTML; "raw" returns bytes as UTF-8.',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  handler: fetchHandler,
};

export const webSearchTool: RegisteredTool = {
  name: 'web_search',
  description:
    'Run a web search via the configured backend (default DuckDuckGo HTML) and return up to 10 hits with title/url/snippet. Disabled unless `tools.web.enabled` is true.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text search query.' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  handler: searchHandler,
};
