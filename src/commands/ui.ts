import { runAgentTaskPrompt } from '../core/agent/run-task.js';
import { buildUiAgentPrompt } from '../core/agent/task-prompts.js';
import { resolveVisualContext } from '../core/vision/visual-context.js';
import { loadMergedConfig } from '../config/load.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { SparkCLIError } from '../utils/errors.js';

export interface UiOptions extends GlobalOptions {
  image?: string;
  figma?: string;
  sketch?: string;
}

export async function runUi(opts: UiOptions, prompt: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);

  const visualContext = await resolveVisualContext(config, {
    image: opts.image,
    figma: opts.figma,
    sketch: opts.sketch,
  });

  if (!prompt && !visualContext) {
    throw new SparkCLIError('Usage: spark-cli ui <prompt> OR ui --image|--figma|--sketch', 1);
  }

  if (opts.dryRun && visualContext && !visualContext.imageDataUrl) {
    if (opts.json) {
      printJson({
        dryRun: true,
        source: visualContext.source,
        summary: visualContext.summary,
      });
    } else {
      logger.info(`Dry run — ${visualContext.source} input parsed (no LLM call)`);
    }
    return;
  }

  await runAgentTaskPrompt(
    opts,
    buildUiAgentPrompt(prompt || 'Implement the UI from the provided design input'),
    { visualContext },
  );
}
