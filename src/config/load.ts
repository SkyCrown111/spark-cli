import { cosmiconfig } from 'cosmiconfig';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { join } from 'node:path';
import { DEFAULT_CONFIG, SparkCLIConfig, SparkCLIConfigSchema } from './schema.js';
import { getGlobalConfigDir, getGlobalConfigPath, getLegacyGlobalConfigPath } from './paths.js';

const MODULE_NAME = 'spark-cli';

function mergeModelConfig(
  global: SparkCLIConfig['model'],
  project: SparkCLIConfig['model'],
): SparkCLIConfig['model'] {
  const merged = { ...global, ...project };
  if (project?.provider === 'auto' && global?.provider && global.provider !== 'auto') {
    merged.provider = global.provider;
  }
  return merged;
}

export async function loadProjectConfig(
  projectRoot: string,
): Promise<{ config: SparkCLIConfig; filepath?: string }> {
  const settingsJsonPath = join(projectRoot, '.spark', 'settings.json');
  if (existsSync(settingsJsonPath)) {
    const raw = readFileSync(settingsJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const config = SparkCLIConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...(parsed as object),
    });
    return { config, filepath: settingsJsonPath };
  }

  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      'spark-cli.config.yaml',
      'spark-cli.config.yml',
      'spark-cli.config.json',
      '.spark-clirc.yaml',
      '.spark-clirc.yml',
      '.spark-clirc',
      'package.json',
    ],
  });
  const result = await explorer.search(projectRoot);
  if (result?.config) {
    const config = SparkCLIConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...result.config,
    });
    return { config, filepath: result.filepath };
  }
  // No project file: return empty overlay so global config fallback still applies.
  return { config: {}, filepath: undefined };
}

export function loadGlobalConfig(): SparkCLIConfig {
  const primaryPath = getGlobalConfigPath();
  if (existsSync(primaryPath)) {
    const raw = readFileSync(primaryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return SparkCLIConfigSchema.parse({ ...DEFAULT_CONFIG, ...(parsed as object) });
  }

  const legacyPath = getLegacyGlobalConfigPath();
  if (existsSync(legacyPath)) {
    const raw = readFileSync(legacyPath, 'utf8');
    const parsed = yaml.load(raw);
    return SparkCLIConfigSchema.parse({ ...DEFAULT_CONFIG, ...(parsed as object) });
  }

  return { ...DEFAULT_CONFIG };
}

export function saveGlobalConfig(config: SparkCLIConfig): void {
  const dir = getGlobalConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = getGlobalConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function mergeConfig(global: SparkCLIConfig, project: SparkCLIConfig): SparkCLIConfig {
  return SparkCLIConfigSchema.parse({
    ...global,
    ...project,
    model: mergeModelConfig(global.model, project.model),
    project: { ...global.project, ...project.project },
    providers: {
      ...global.providers,
      ...project.providers,
      custom_providers: [
        ...(global.providers?.custom_providers ?? []),
        ...(project.providers?.custom_providers ?? []),
      ],
      fallback_providers:
        project.providers?.fallback_providers ?? global.providers?.fallback_providers,
    },
    tasks: { ...global.tasks, ...project.tasks },
    ui: { ...global.ui, ...project.ui },
    security: { ...global.security, ...project.security },
    mcp: {
      ...global.mcp,
      ...project.mcp,
      servers: [...(global.mcp?.servers ?? []), ...(project.mcp?.servers ?? [])],
    },
    wechat: { ...global.wechat, ...project.wechat },
    douyin: { ...global.douyin, ...project.douyin },
    alipay: { ...global.alipay, ...project.alipay },
    huawei: { ...global.huawei, ...project.huawei },
    figma: { ...global.figma, ...project.figma },
    editor: { ...global.editor, ...project.editor },
    cloud: { ...global.cloud, ...project.cloud },
    context: { ...global.context, ...project.context },
  });
}

export async function loadMergedConfig(projectRoot: string): Promise<SparkCLIConfig> {
  const global = loadGlobalConfig();
  const { config: project } = await loadProjectConfig(projectRoot);
  return mergeConfig(global, project);
}

export function writeProjectConfigYaml(projectRoot: string, config: SparkCLIConfig): string {
  const sparkDir = join(projectRoot, '.spark');
  if (!existsSync(sparkDir)) {
    mkdirSync(sparkDir, { recursive: true });
  }
  const filepath = join(sparkDir, 'settings.json');
  writeFileSync(filepath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return filepath;
}
