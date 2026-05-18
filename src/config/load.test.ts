import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeConfig, loadProjectConfig } from './load.js';
import type { SparkCLIConfig } from './schema.js';

describe('mergeConfig', () => {
  it('keeps global model provider when project overlay is empty', () => {
    const global: SparkCLIConfig = {
      model: { provider: 'mimo', default: 'mimo-v2-flash' },
    };
    const merged = mergeConfig(global, {});
    expect(merged.model?.provider).toBe('mimo');
    expect(merged.model?.default).toBe('mimo-v2-flash');
  });

  it('does not let project provider=auto override an explicit global provider', () => {
    const global: SparkCLIConfig = {
      model: { provider: 'mimo', default: 'mimo-v2-flash' },
    };
    const project: SparkCLIConfig = {
      model: { provider: 'auto' },
    };
    const merged = mergeConfig(global, project);
    expect(merged.model?.provider).toBe('mimo');
    expect(merged.model?.default).toBe('mimo-v2-flash');
  });
});

describe('loadProjectConfig', () => {
  it('returns empty config when no project file exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-cli-load-'));
    const { config, filepath } = await loadProjectConfig(dir);
    expect(filepath).toBeUndefined();
    expect(config.model).toBeUndefined();
  });

  it('loads spark-cli.config.yaml when present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-cli-load-'));
    writeFileSync(
      join(dir, 'spark-cli.config.yaml'),
      'model:\n  provider: deepseek\n  default: deepseek-chat\n',
      'utf8',
    );
    const { config } = await loadProjectConfig(dir);
    expect(config.model?.provider).toBe('deepseek');
  });
});
