import { describe, expect, it } from 'vitest';
import {
  SparkCLIConfigSchema,
  CustomProviderSchema,
  McpServerConfigSchema,
  DEFAULT_CONFIG,
} from './schema.js';

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

  it('accepts minimal config', () => {
    const result = SparkCLIConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full config with custom providers', () => {
    const config = {
      project: { root: '/path', engine: 'cocos-creator' as const },
      model: { provider: 'openai', default: 'gpt-4' },
      providers: {
        custom_providers: [{ name: 'test', base_url: 'https://api.test.com', api_key: 'key' }],
      },
      tasks: {
        chat: { provider: 'openai', model: 'gpt-4' },
      },
    };
    const result = SparkCLIConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects invalid engine', () => {
    const result = SparkCLIConfigSchema.safeParse({
      project: { engine: 'invalid-engine' },
    });
    expect(result.success).toBe(false);
  });
});

describe('CustomProviderSchema', () => {
  it('accepts valid provider', () => {
    const result = CustomProviderSchema.safeParse({
      name: 'test',
      base_url: 'https://api.test.com',
      api_mode: 'openai',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = CustomProviderSchema.safeParse({
      base_url: 'https://api.test.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid api_mode', () => {
    const result = CustomProviderSchema.safeParse({
      name: 'test',
      base_url: 'https://api.test.com',
      api_mode: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('McpServerConfigSchema', () => {
  it('accepts stdio transport', () => {
    const result = McpServerConfigSchema.safeParse({
      name: 'test-server',
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts http transport', () => {
    const result = McpServerConfigSchema.safeParse({
      name: 'test-server',
      transport: 'http',
      url: 'https://mcp.test.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid transport', () => {
    const result = McpServerConfigSchema.safeParse({
      name: 'test-server',
      transport: 'websocket',
    });
    expect(result.success).toBe(false);
  });
});
