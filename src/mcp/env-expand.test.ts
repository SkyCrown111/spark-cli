import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { expandEnvVars } from './client.js';

describe('expandEnvVars', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('expands ${VAR} syntax', () => {
    process.env.TEST_VAR = 'hello';
    expect(expandEnvVars('${TEST_VAR}')).toBe('hello');
  });

  it('expands ${VAR:-default} with missing var', () => {
    delete process.env.MISSING_VAR;
    expect(expandEnvVars('${MISSING_VAR:-fallback}')).toBe('fallback');
  });

  it('expands ${VAR:-default} with existing var', () => {
    process.env.EXISTING = 'actual';
    expect(expandEnvVars('${EXISTING:-fallback}')).toBe('actual');
  });

  it('returns empty string for undefined vars without default', () => {
    delete process.env.UNDEFINED_VAR;
    expect(expandEnvVars('${UNDEFINED_VAR}')).toBe('');
  });

  it('handles multiple expansions in one string', () => {
    process.env.A = 'foo';
    process.env.B = 'bar';
    expect(expandEnvVars('${A}/${B}')).toBe('foo/bar');
  });

  it('leaves strings without vars unchanged', () => {
    expect(expandEnvVars('no vars here')).toBe('no vars here');
  });

  it('handles empty default', () => {
    delete process.env.EMPTY_DEFAULT;
    expect(expandEnvVars('${EMPTY_DEFAULT:-}')).toBe('');
  });
});
