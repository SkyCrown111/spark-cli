import type { SparkCLIConfig } from '../../config/schema.js';
import { SparkCLIError } from '../../utils/errors.js';
import { imageToDataUrl } from './image-input.js';
import { fetchFigmaDesignSummary } from './figma-import.js';
import { parseSketchJson, sketchToDesignSummary } from './sketch-import.js';

export interface VisualInputContext {
  source: 'image' | 'figma' | 'sketch';
  summary: string;
  imageDataUrl?: string;
}

export interface UiVisualOptions {
  image?: string;
  figma?: string;
  sketch?: string;
}

function figmaToken(config: SparkCLIConfig): string {
  return config.figma?.token ?? process.env.FIGMA_TOKEN ?? '';
}

export async function resolveVisualContext(
  config: SparkCLIConfig,
  options: UiVisualOptions,
): Promise<VisualInputContext | undefined> {
  const sources = [options.image, options.figma, options.sketch].filter(Boolean);
  if (sources.length > 1) {
    throw new SparkCLIError('Use only one of --image, --figma, or --sketch', 1);
  }
  if (!sources.length) return undefined;

  if (options.image) {
    const { dataUrl, mime, bytes } = imageToDataUrl(options.image);
    return {
      source: 'image',
      imageDataUrl: dataUrl,
      summary: `Reference image: ${options.image} (${mime}, ${bytes} bytes)`,
    };
  }

  if (options.figma) {
    const figma = await fetchFigmaDesignSummary(options.figma, figmaToken(config));
    return {
      source: 'figma',
      summary: `## Figma design\n${figma.summary}`,
    };
  }

  if (options.sketch) {
    const doc = parseSketchJson(options.sketch);
    return {
      source: 'sketch',
      summary: `## Sketch export\n${sketchToDesignSummary(doc)}`,
    };
  }

  return undefined;
}
