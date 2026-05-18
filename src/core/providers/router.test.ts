import { describe, expect, it } from 'vitest';
import { resolveModelForTask } from './router.js';
import type { SparkCLIConfig } from '../../config/schema.js';

describe('resolveModelForTask', () => {
  it('uses explicit overrides', () => {
    const config: SparkCLIConfig = {
      model: { default: 'gpt-4o-mini', provider: 'openai' },
    };
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const r = resolveModelForTask(config, 'chat', {
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
    expect(r.providerId).toBe('deepseek');
    expect(r.model).toBe('deepseek-chat');
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('uses fallback when provider is auto', () => {
    const config: SparkCLIConfig = {
      model: { default: 'deepseek-chat', provider: 'auto' },
      providers: {
        fallback_providers: [{ name: 'deepseek', model: 'deepseek-chat', priority: 1 }],
      },
    };
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const r = resolveModelForTask(config, 'gen');
    expect(r.providerId).toBe('deepseek');
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('prefers config.yaml api_key over environment for the same provider', () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-from-env';
    const config: SparkCLIConfig = {
      model: {
        provider: 'openai',
        default: 'gpt-4o-mini',
        api_key: 'sk-from-config',
      },
    };
    const r = resolveModelForTask(config, 'chat');
    expect(r.apiKey).toBe('sk-from-config');
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  });

  it('does not reuse config.yaml api_key for a different overridden provider', () => {
    const prevOpenAI = process.env.OPENAI_API_KEY;
    const prevDeepSeek = process.env.DEEPSEEK_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-openai-env';
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-env';
    const config: SparkCLIConfig = {
      model: {
        provider: 'openai',
        default: 'gpt-4o-mini',
        api_key: 'sk-from-config',
      },
    };
    const r = resolveModelForTask(config, 'chat', {
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
    expect(r.providerId).toBe('deepseek');
    expect(r.apiKey).toBe('sk-deepseek-env');
    if (prevOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAI;
    if (prevDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prevDeepSeek;
  });
});
