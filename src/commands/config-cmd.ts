import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadGlobalConfig, saveGlobalConfig } from '../config/load.js';
import { getGlobalConfigPath } from '../config/paths.js';
import { BUILTIN_PROVIDERS } from '../core/providers/registry.js';
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
        { name: 'User global (~/.spark-cli/config.yaml)', value: 'global' },
        { name: 'Current project (spark-cli.config.yaml)', value: 'project' },
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
    console.log(chalk.dim('\nProject config created. Set model with: spark-cli model use <provider>/<model>'));
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
      key_env: string;
    }>([
      { type: 'input', name: 'name', message: 'Provider id (e.g. mimo)', validate: (v) => !!v.trim() },
      {
        type: 'input',
        name: 'base_url',
        message: 'API base URL (e.g. https://api.example.com/v1)',
        validate: (v) => (v.startsWith('http') ? true : 'Must be a URL'),
      },
      {
        type: 'input',
        name: 'key_env',
        message: 'Environment variable name for API key (e.g. MIMO_API_KEY)',
        validate: (v) => (/^[A-Z][A-Z0-9_]*$/.test(v) ? true : 'Use UPPER_SNAKE_CASE name'),
      },
    ]);
    providerId = custom.name.trim();
    config.providers = {
      ...config.providers,
      custom_providers: [
        ...(config.providers?.custom_providers ?? []).filter((p) => p.name !== providerId),
        {
          name: providerId,
          base_url: custom.base_url.trim(),
          key_env: custom.key_env.trim(),
          api_mode: 'openai',
        },
      ],
    };
    console.log(
      chalk.yellow(
        `\nSet your key in PowerShell: $env:${custom.key_env.trim()} = "your-token"\n`,
      ),
    );
  } else {
    const builtin = BUILTIN_PROVIDERS.find((p) => p.id === providerId);
    if (builtin) {
      console.log(chalk.dim(`\nSet: $env:${builtin.envKey} = "your-key"\n`));
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
  console.log(chalk.green('✓'), 'Wrote', chalk.cyan(getGlobalConfigPath()));
  console.log(chalk.dim('Run: spark-cli model test && spark-cli doctor'));
}

export async function runConfigShow(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const global = loadGlobalConfig();
  if (opts.json) {
    console.log(JSON.stringify({ globalPath: getGlobalConfigPath(), global }, null, 2));
    return;
  }
  console.log(chalk.bold('\nGlobal config'), chalk.dim(getGlobalConfigPath()));
  console.log(
    `  model: ${global.model?.provider ?? 'auto'} / ${global.model?.default ?? '(not set)'}`,
  );
  const custom = global.providers?.custom_providers?.length ?? 0;
  if (custom > 0) console.log(chalk.dim(`  custom providers: ${custom}`));
  console.log(chalk.dim('\nProject root:'), root);
}
