import { describe, expect, it } from 'vitest';
import { SparkCLIConfigSchema, DEFAULT_CONFIG } from './schema.js';

describe('SparkCLIConfigSchema', () => {
  it('parses default config', () => {
    const config = SparkCLIConfigSchema.parse(DEFAULT_CONFIG);
    expect(config.project?.engine).toBe('cocos-creator');
  });

  it('parses model and providers', () => {
    const config = SparkCLIConfigSchema.parse({
      model: { default: 'gpt-4o', provider: 'openai' },
      providers: {
        fallback_providers: [{ name: 'deepseek', model: 'deepseek-chat', priority: 1 }],
      },
    });
    expect(config.model?.default).toBe('gpt-4o');
  });
});
