/**
 * Image generation providers (OpenAI-compatible / mock).
 */

import { stageWriteFile } from '../staging/patch-manager.js';
import type { SparkCLIConfig } from '../../config/schema.js';

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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#334155"/><text x="4" y="20" font-size="8" fill="#fff">${req.prompt.slice(0, 12)}</text></svg>`;
    stageWriteFile(projectRoot, req.outPath, svg);
    return { path: req.outPath, staged: true, provider: this.id, source: 'mock' };
  }
}

export function isImageGenEnabled(config: SparkCLIConfig): boolean {
  return config.tools?.gen?.image?.enabled === true;
}

export function resolveImageGenProvider(config: SparkCLIConfig): ImageGenProvider {
  const id = config.tools?.gen?.image?.provider ?? 'mock';
  if (id === 'mock' || !isImageGenEnabled(config)) return new MockImageGenProvider();
  return new MockImageGenProvider();
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
