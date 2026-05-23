import chalk from 'chalk';
import { loadGlobalConfig, saveGlobalConfig, loadMergedConfig } from '../config/load.js';
import {
  BUILTIN_PROVIDERS,
  formatModelRef,
  parseModelRef,
  resolveConfiguredApiKey,
} from '../core/providers/registry.js';
import { resolveModelForTask, testResolvedModel } from '../core/providers/router.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { SparkCLIError } from '../utils/errors.js';

export async function runModelList(opts: GlobalOptions, providerFilter?: string): Promise<void> {
  const config = loadGlobalConfig();
  const list = providerFilter
    ? BUILTIN_PROVIDERS.filter((p) => p.id === providerFilter)
    : BUILTIN_PROVIDERS;

  if (opts.json) {
    printJson(list);
    return;
  }

  logger.info(chalk.bold('\nProviders\n'));
  for (const p of list) {
    const hasKey = Boolean(resolveConfiguredApiKey(config, p.id));
    const keyStatus = hasKey ? chalk.green('key ok') : chalk.dim('no key');
    logger.info(`  ${chalk.cyan(p.id)}  ${p.label}  [${keyStatus}]`);
    logger.info(chalk.dim(`    models: ${p.exampleModels.join(', ')}`));
  }
}

export async function runModelCurrent(opts: GlobalOptions): Promise<void> {
  const config = loadGlobalConfig();
  const provider = config.model?.provider ?? 'auto';
  const model = config.model?.default ?? '(not set)';

  if (opts.json) {
    printJson({ provider, model });
    return;
  }
  logger.info(chalk.bold('\nCurrent default model\n'));
  logger.info(`  ${chalk.cyan(provider)} / ${chalk.white(String(model))}`);
}

export async function runModelUse(
  opts: GlobalOptions,
  ref?: string,
  explicit?: { provider?: string; model?: string },
): Promise<void> {
  const config = loadGlobalConfig();

  let provider: string;
  let model: string;

  if (explicit?.provider && explicit?.model) {
    provider = explicit.provider;
    model = explicit.model;
  } else if (ref) {
    const parsed = parseModelRef(ref);
    provider = parsed.provider;
    model = parsed.model;
  } else {
    throw new Error('Usage: spark-cli model use <provider>/<model>  OR  --provider X --model Y');
  }

  config.model = {
    ...config.model,
    provider,
    default: model,
  };
  saveGlobalConfig(config);

  if (opts.json) {
    printJson({ provider, model });
    return;
  }
  logger.info(
    chalk.green('✓'),
    'Default model set to',
    chalk.cyan(formatModelRef(provider, model)),
  );
  logger.info(chalk.dim(`  Saved to ~/.spark/settings.json`));
}

export async function runModelTest(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);

  let resolved;
  try {
    resolved = resolveModelForTask(config, 'chat', {
      provider: opts.provider,
      model: opts.model,
    });
  } catch (e) {
    if (e instanceof SparkCLIError) {
      if (opts.json) printJson({ ok: false, error: e.message });
      else logger.info(chalk.red('✗'), e.message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  if (opts.json) {
    logger.json({
      ok: true,
      provider: resolved.providerId,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      testing: true,
    });
  } else {
    logger.info(
      chalk.dim(`Pinging ${resolved.providerId}/${resolved.model} at ${resolved.baseUrl}...`),
    );
  }

  try {
    await testResolvedModel(resolved, config);
    if (opts.json) {
      printJson({ ok: true, provider: resolved.providerId, model: resolved.model });
    } else {
      logger.info(chalk.green('✓'), `Model ${resolved.providerId}/${resolved.model} is reachable`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.json) printJson({ ok: false, error: msg });
    else logger.info(chalk.red('✗'), msg);
    process.exitCode = 1;
  }
}
