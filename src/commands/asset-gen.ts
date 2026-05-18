import chalk from 'chalk';
import { loadMergedConfig } from '../config/load.js';
import { generateImageAsset } from '../core/providers/image-gen.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runAssetGenerateIcon(
  opts: GlobalOptions,
  prompt: string,
  cmdOpts: { size?: string; out?: string },
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const outPath = cmdOpts.out ?? 'assets/textures/generated-icon.svg';
  const size = cmdOpts.size ?? '64x64';

  const genConfig = {
    ...config,
    tools: {
      ...config.tools,
      gen: {
        ...config.tools?.gen,
        image: { enabled: true, provider: 'mock' as const, ...config.tools?.gen?.image },
      },
    },
  };

  try {
    const result = await generateImageAsset(root, genConfig, {
      prompt: `${prompt} (${size})`,
      size,
      outPath,
    });
    if (opts.json) {
      printJson(result);
      return 0;
    }
    console.log(chalk.green(`✓ Staged ${result.path} via ${result.provider}`));
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      printJson({ error: msg });
      return 1;
    }
    console.error(chalk.red(msg));
    console.error(chalk.dim('Enable tools.gen.image.enabled or use provider: mock in config'));
    return 1;
  }
}
