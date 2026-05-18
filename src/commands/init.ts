import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { writeProjectConfigYaml } from '../config/load.js';
import { DEFAULT_CONFIG, type SparkCLIConfig } from '../config/schema.js';
import { getProjectSparkDir } from '../config/paths.js';
import { detectEngine, type EngineId } from '../engines/registry.js';

const DEFAULT_IGNORE = `library/
temp/
local/
build/
node_modules/
.env
.spark-cli/staging/
.spark-cli/backups/
.spark-cli/cache/
.godot/
Binaries/
Intermediate/
DerivedDataCache/
`;

export type InitEngine = 'cocos-creator' | 'unity' | 'unreal' | 'godot';

export async function runInit(
  opts: GlobalOptions,
  engineOverride?: InitEngine,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const detected = detectEngine(root, engineOverride);
  const engine: EngineId = engineOverride ?? (detected.id !== 'unknown' ? detected.id : 'cocos-creator');

  const config: SparkCLIConfig = {
    ...DEFAULT_CONFIG,
    project: {
      root: '.',
      engine,
      engineVersion: detected.version,
    },
  };

  const configPath = writeProjectConfigYaml(root, config);
  const sparkDir = getProjectSparkDir(root);
  mkdirSync(sparkDir, { recursive: true });
  mkdirSync(join(sparkDir, 'memory'), { recursive: true });

  const ignorePath = join(root, '.spark-cliignore');
  if (!existsSync(ignorePath)) {
    writeFileSync(ignorePath, DEFAULT_IGNORE, 'utf8');
  }

  console.log(chalk.green('✓'), 'Created', chalk.cyan(configPath));
  console.log(chalk.green('✓'), 'Created', chalk.cyan('.spark-cli/'));
  const label =
    engine === 'unreal'
      ? 'Unreal Engine'
      : engine === 'godot'
        ? 'Godot'
        : engine === 'unity'
          ? 'Unity'
          : 'Cocos Creator';
  console.log(
    chalk.dim(
      `  Engine: ${label}${detected.version ? ` (${detected.version})` : ''}${engineOverride ? ' [from --engine]' : ''}`,
    ),
  );
  if (detected.id === 'unknown' && !engineOverride) {
    console.log(chalk.yellow('  No engine detected — set project.engine in config'));
  }
  console.log(chalk.dim('\nNext: spark-cli model use openai/gpt-4o  (or your provider)'));
  console.log(chalk.dim('       spark-cli doctor'));
}
