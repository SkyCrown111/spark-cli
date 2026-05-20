import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateImageAsset,
  mapOpenAIImageSize,
  resolveImageGenProviderId,
  MockImageGenProvider,
} from './image-gen.js';
import type { SparkCLIConfig } from '../../config/schema.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

describe('image-gen', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'spark-img-gen-'));
    vi.mocked(request).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mapOpenAIImageSize buckets dimensions', () => {
    expect(mapOpenAIImageSize('64x64')).toBe('256x256');
    expect(mapOpenAIImageSize('400x300')).toBe('512x512');
    expect(mapOpenAIImageSize('2048x1024')).toBe('1024x1024');
  });

  it('resolveImageGenProviderId uses mock when disabled', () => {
    const cfg = {
      tools: { gen: { image: { enabled: false, provider: 'openai' } } },
    } as SparkCLIConfig;
    expect(resolveImageGenProviderId(cfg)).toBe('mock');
  });

  it('mock provider stages svg', async () => {
    const p = new MockImageGenProvider();
    const r = await p.generate({ prompt: 'icon', outPath: 'assets/x.svg' }, projectRoot);
    expect(r.source).toBe('mock');
    expect(r.staged).toBe(true);
  });

  it('openai provider stages png from API response', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    vi.mocked(request).mockResolvedValue({
      statusCode: 200,
      body: {
        text: async () =>
          JSON.stringify({ data: [{ b64_json: pngBytes.toString('base64') }] }),
      },
    } as never);

    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    const cfg = {
      model: { default: 'gpt-4o-mini', provider: 'openai' },
      tools: { gen: { image: { enabled: true, provider: 'openai' } } },
    } as SparkCLIConfig;

    const r = await generateImageAsset(projectRoot, cfg, {
      prompt: 'fire wand',
      size: '128x128',
      outPath: 'assets/icon.png',
    });
    expect(r.provider).toBe('openai');
    expect(r.source).toBe('generated');
    expect(r.path).toBe('assets/icon.png');
    expect(vi.mocked(request)).toHaveBeenCalled();
  });
});
