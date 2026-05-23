import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadGlobalConfig, saveGlobalConfig } from '../config/load.js';
import { getGlobalConfigPath } from '../config/paths.js';
import { logger } from '../utils/logger.js';
import {
  BUILTIN_PROVIDERS,
  looksLikePastedApiKey,
  normalizeEnvVarName,
  suggestEnvVarNameForProvider,
} from '../core/providers/registry.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { runInit, type InitEngine } from './init.js';

export async function runConfigInit(opts: GlobalOptions): Promise<void> {
  const { scope } = await inquirer.prompt<{ scope: 'global' | 'project' }>([
    {
      type: 'list',
      name: 'scope',
      message: 'Initialize configuration for:',
      choices: [
        { name: 'User global (~/.spark/settings.json)', value: 'global' },
        { name: 'Current project (.spark/settings.json)', value: 'project' },
      ],
    },
  ]);

  if (scope === 'project') {
    const { engine } = await inquirer.prompt<{ engine: InitEngine }>([
      {
        type: 'list',
        name: 'engine',
        message: 'Project engine',
        choices: [
          { name: 'Cocos Creator', value: 'cocos-creator' },
          { name: 'Unity', value: 'unity' },
          { name: 'Unreal', value: 'unreal' },
          { name: 'Godot', value: 'godot' },
        ],
        default: 'cocos-creator',
      },
    ]);
    await runInit(opts, engine);
    logger.info(
      chalk.dim('\nProject config created. Set model with: spark-cli model use <provider>/<model>'),
    );
    return;
  }

  const config = loadGlobalConfig();
  const providerChoices = [
    ...BUILTIN_PROVIDERS.map((p) => ({
      name: `${p.label} (${p.id})`,
      value: p.id,
    })),
    { name: 'Custom OpenAI-compatible API', value: '__custom__' },
  ];

  const { providerPick } = await inquirer.prompt<{ providerPick: string }>([
    {
      type: 'list',
      name: 'providerPick',
      message: 'Default LLM provider',
      choices: providerChoices,
    },
  ]);

  let providerId = providerPick;
  if (providerPick === '__custom__') {
    const custom = await inquirer.prompt<{
      name: string;
      base_url: string;
    }>([
      {
        type: 'input',
        name: 'name',
        message: 'Provider id (e.g. baidu, mimo)',
        validate: (v) => !!v.trim(),
      },
      {
        type: 'input',
        name: 'base_url',
        message: 'API base URL (e.g. https://api.example.com/v1)',
        validate: (v) => (v.startsWith('http') ? true : 'Must be a URL'),
      },
    ]);
    providerId = custom.name.trim();
    const envDefault = suggestEnvVarNameForProvider(providerId);

    const { keyMode } = await inquirer.prompt<{ keyMode: 'env' | 'config' }>([
      {
        type: 'list',
        name: 'keyMode',
        message: 'How do you want to store your API key?',
        choices: [
          {
            name: 'Environment variable (recommended — key not saved in settings.json)',
            value: 'env',
          },
          {
            name: 'Save in ~/.spark/settings.json as api_key',
            value: 'config',
          },
        ],
        default: 'env',
      },
    ]);

    let keyEnv: string | undefined;
    let apiKey: string | undefined;

    if (keyMode === 'env') {
      const { key_env } = await inquirer.prompt<{ key_env: string }>([
        {
          type: 'input',
          name: 'key_env',
          message: 'Env var NAME only (not the secret). Example: BAIDU_API_KEY — lowercase is OK',
          default: envDefault,
          validate: (v) => {
            const raw = v.trim();
            if (!raw) return 'Enter a name like BAIDU_API_KEY';
            if (looksLikePastedApiKey(raw)) {
              return 'That looks like your API key. Enter a NAME (e.g. BAIDU_API_KEY), then paste the key in the next step.';
            }
            const normalized = normalizeEnvVarName(raw);
            if (!normalized || !/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
              return 'Use letters, numbers, and underscores (e.g. BAIDU_API_KEY)';
            }
            return true;
          },
        },
      ]);
      keyEnv = normalizeEnvVarName(key_env);

      const { keyValue } = await inquirer.prompt<{ keyValue: string }>([
        {
          type: 'password',
          name: 'keyValue',
          message: `Paste your API key (saved to $env:${keyEnv} for this session)`,
          mask: '*',
          validate: (v) => (v.trim().length > 0 ? true : 'API key cannot be empty'),
        },
      ]);
      process.env[keyEnv] = keyValue.trim();
      logger.info(chalk.green('✓'), `Set $env:${keyEnv} for this terminal session.`);
      logger.info(
        chalk.dim(
          `  To persist: System Properties → Environment Variables → New user variable ${keyEnv}`,
        ),
      );
    } else {
      const { keyValue } = await inquirer.prompt<{ keyValue: string }>([
        {
          type: 'password',
          name: 'keyValue',
          message: 'Paste your API key (stored in settings.json — do not commit this file)',
          mask: '*',
          validate: (v) => (v.trim().length > 0 ? true : 'API key cannot be empty'),
        },
      ]);
      apiKey = keyValue.trim();
      logger.warn(
        chalk.yellow(
          '\n  api_key is stored locally. Never commit ~/.spark/settings.json to git.\n',
        ),
      );
    }

    config.providers = {
      ...config.providers,
      custom_providers: [
        ...(config.providers?.custom_providers ?? []).filter((p) => p.name !== providerId),
        {
          name: providerId,
          base_url: custom.base_url.trim(),
          ...(keyEnv ? { key_env: keyEnv } : {}),
          ...(apiKey ? { api_key: apiKey } : {}),
          api_mode: 'openai',
        },
      ],
    };
  } else {
    const builtin = BUILTIN_PROVIDERS.find((p) => p.id === providerId);
    if (builtin) {
      logger.info(chalk.dim(`\nSet: $env:${builtin.envKey} = "your-key"\n`));
    }
  }

  const { model } = await inquirer.prompt<{ model: string }>([
    {
      type: 'input',
      name: 'model',
      message: 'Default model id',
      default: providerId === 'openai' ? 'gpt-4o' : providerId === 'mimo' ? 'mimo-v2.5-pro' : '',
      validate: (v) => !!v.trim(),
    },
  ]);

  const { useCloud } = await inquirer.prompt<{ useCloud: boolean }>([
    {
      type: 'confirm',
      name: 'useCloud',
      message: 'Enable SparkCLI Cloud section (local mock)?',
      default: false,
    },
  ]);

  config.model = {
    ...config.model,
    provider: providerId,
    default: model.trim().toLowerCase(),
  };

  if (useCloud) {
    config.cloud = {
      enabled: true,
      endpoint: 'http://127.0.0.1:17401',
      useCloudKeys: false,
    };
  }

  saveGlobalConfig(config);
  logger.info(chalk.green('✓'), 'Wrote', chalk.cyan(getGlobalConfigPath()));
  logger.info(chalk.dim('Run: spark-cli model test && spark-cli doctor'));
}

export async function runConfigShow(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const global = loadGlobalConfig();
  if (opts.json) {
    logger.json({ globalPath: getGlobalConfigPath(), global });
    return;
  }
  logger.info(chalk.bold('\nGlobal config'), chalk.dim(getGlobalConfigPath()));
  logger.info(
    `  model: ${global.model?.provider ?? 'auto'} / ${global.model?.default ?? '(not set)'}`,
  );
  const custom = global.providers?.custom_providers?.length ?? 0;
  if (custom > 0) logger.info(chalk.dim(`  custom providers: ${custom}`));
  logger.info(chalk.dim('\nProject root:'), root);
}
