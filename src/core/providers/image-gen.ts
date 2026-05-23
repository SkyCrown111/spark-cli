/**
 * Image generation providers (mock / OpenAI Images API).
 */

import { request } from 'undici';
import { stageWriteBuffer, stageWriteFile } from '../staging/patch-manager.js';
import type { SparkCLIConfig } from '../../config/schema.js';
import { DEFAULT_BASE_URLS, normalizeBaseUrl } from './endpoints.js';
import { resolveConfiguredApiKey } from './registry.js';
import { resolveModelForTask } from './router.js';
import { SparkCLIError } from '../../utils/errors.js';

export interface ImageGenRequest {
  prompt: string;
  size?: string;
  outPath: string;
}

export interface ImageGenResult {
  path: string;
  staged: boolean;
  provider: string;
  source: 'generated' | 'mock';
}

export interface ImageGenProvider {
  id: string;
  generate(req: ImageGenRequest, projectRoot: string): Promise<ImageGenResult>;
}

export class MockImageGenProvider implements ImageGenProvider {
  id = 'mock';

  async generate(req: ImageGenRequest, projectRoot: string): Promise<ImageGenResult> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#334155"/><text x="4" y="20" font-size="8" fill="#fff">${escapeXml(req.prompt.slice(0, 12))}</text></svg>`;
    stageWriteFile(projectRoot, req.outPath, svg);
    return { path: req.outPath, staged: true, provider: this.id, source: 'mock' };
  }
}

export class OpenAIImageGenProvider implements ImageGenProvider {
  id = 'openai';

  constructor(private readonly config: SparkCLIConfig) {}

  async generate(req: ImageGenRequest, projectRoot: string): Promise<ImageGenResult> {
    const { apiKey, baseUrl } = resolveOpenAIImageCredentials(this.config);
    const size = mapOpenAIImageSize(req.size);
    const url = `${normalizeBaseUrl(baseUrl)}/images/generations`;
    const res = await request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-2',
        prompt: req.prompt,
        size,
        n: 1,
        response_format: 'b64_json',
      }),
    });
    const raw = await res.body.text();
    if (res.statusCode >= 400) {
      throw new SparkCLIError(
        `OpenAI image generation failed (${res.statusCode}): ${raw.slice(0, 400)}`,
        1,
      );
    }
    let parsed: { data?: Array<{ b64_json?: string }> };
    try {
      parsed = JSON.parse(raw) as { data?: Array<{ b64_json?: string }> };
    } catch {
      throw new SparkCLIError('OpenAI image generation returned invalid JSON', 1);
    }
    const b64 = parsed.data?.[0]?.b64_json;
    if (!b64) {
      throw new SparkCLIError('OpenAI image generation returned no image data', 1);
    }
    const png = Buffer.from(b64, 'base64');
    const outPath = req.outPath.match(/\.(png|jpg|jpeg|webp)$/i)
      ? req.outPath
      : req.outPath.replace(/\.[^.]+$/, '') + '.png';
    stageWriteBuffer(projectRoot, outPath, png);
    return { path: outPath, staged: true, provider: this.id, source: 'generated' };
  }
}

export function isImageGenEnabled(config: SparkCLIConfig): boolean {
  return config.tools?.gen?.image?.enabled === true;
}

/** Effective provider id after enabled/disabled rules. */
export function resolveImageGenProviderId(config: SparkCLIConfig): string {
  const id = config.tools?.gen?.image?.provider ?? 'mock';
  if (!isImageGenEnabled(config)) return 'mock';
  if (id === 'stability') return 'stability-unimplemented';
  return id;
}

export function resolveImageGenProvider(config: SparkCLIConfig): ImageGenProvider {
  const effective = resolveImageGenProviderId(config);
  if (effective === 'mock') return new MockImageGenProvider();
  if (effective === 'openai') return new OpenAIImageGenProvider(config);
  if (effective === 'stability-unimplemented') {
    throw new SparkCLIError(
      'Stability image provider is not implemented yet. Use provider: mock or openai.',
      1,
    );
  }
  throw new SparkCLIError(`Unknown image provider: ${effective}`, 1);
}

export async function generateImageAsset(
  projectRoot: string,
  config: SparkCLIConfig,
  req: ImageGenRequest,
): Promise<ImageGenResult> {
  const providerId = config.tools?.gen?.image?.provider ?? 'mock';
  if (!isImageGenEnabled(config) && providerId !== 'mock') {
    throw new Error('Image generation disabled — set tools.gen.image.enabled: true');
  }
  return resolveImageGenProvider(config).generate(req, projectRoot);
}

function resolveOpenAIImageCredentials(config: SparkCLIConfig): {
  apiKey: string;
  baseUrl: string;
} {
  try {
    const resolved = resolveModelForTask(config, 'gen');
    if (resolved.apiKey) {
      return { apiKey: resolved.apiKey, baseUrl: resolved.baseUrl };
    }
  } catch {
    /* fall through to openai builtin */
  }
  const apiKey = resolveConfiguredApiKey(config, 'openai');
  if (!apiKey) {
    throw new SparkCLIError(
      'OpenAI API key required for image generation. Set OPENAI_API_KEY or tasks.gen with a configured provider.',
      1,
    );
  }
  return {
    apiKey,
    baseUrl: config.model?.base_url ?? DEFAULT_BASE_URLS.openai ?? 'https://api.openai.com/v1',
  };
}

/** Map user WxH to OpenAI dall-e-2 allowed sizes. */
export function mapOpenAIImageSize(size?: string): '256x256' | '512x512' | '1024x1024' {
  const m = size?.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) return '1024x1024';
  const max = Math.max(Number(m[1]), Number(m[2]));
  if (max <= 256) return '256x256';
  if (max <= 512) return '512x512';
  return '1024x1024';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
