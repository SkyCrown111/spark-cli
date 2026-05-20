import { describe, it, expect, afterEach } from 'vitest';
import {
  isEnvVarName,
  looksLikePastedApiKey,
  normalizeEnvVarName,
  resolveCustomProviderApiKey,
  suggestEnvVarNameForProvider,
} from './registry.js';

describe('resolveCustomProviderApiKey', () => {
  const prev = process.env.TEST_SPARK_CLI_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.TEST_SPARK_CLI_KEY;
    else process.env.TEST_SPARK_CLI_KEY = prev;
  });

  it('reads from env when key_env is a variable name', () => {
    process.env.TEST_SPARK_CLI_KEY = 'secret-from-env';
    const r = resolveCustomProviderApiKey({ key_env: 'TEST_SPARK_CLI_KEY' });
    expect(r.apiKey).toBe('secret-from-env');
    expect(r.keyEnvMisuse).toBeUndefined();
  });

  it('flags secret pasted into key_env', () => {
    const r = resolveCustomProviderApiKey({ key_env: 'tp-abc123' });
    expect(r.apiKey).toBe('tp-abc123');
    expect(r.keyEnvMisuse).toBe(true);
  });

  it('isEnvVarName accepts MIMO_API_KEY only', () => {
    expect(isEnvVarName('MIMO_API_KEY')).toBe(true);
    expect(isEnvVarName('tp-abc')).toBe(false);
  });

  it('normalizeEnvVarName uppercases baidu_api_key', () => {
    expect(normalizeEnvVarName('baidu_api_key')).toBe('BAIDU_API_KEY');
    expect(normalizeEnvVarName('BAIDU_API_KEY')).toBe('BAIDU_API_KEY');
  });

  it('suggestEnvVarNameForProvider', () => {
    expect(suggestEnvVarNameForProvider('baidu')).toBe('BAIDU_API_KEY');
  });

  it('looksLikePastedApiKey detects secrets', () => {
    expect(looksLikePastedApiKey('BAIDU_API_KEY')).toBe(false);
    expect(looksLikePastedApiKey('sk-abc123def456ghi789jkl012')).toBe(true);
    expect(looksLikePastedApiKey('tp-abc123')).toBe(true);
  });
});
