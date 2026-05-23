import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRenderer } from './renderer.js';

describe('resolveRenderer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to main-screen renderer', () => {
    expect(resolveRenderer({})).toBe('default');
  });

  it('prefers explicit CLI renderer over config and env', () => {
    vi.stubEnv('SPARK_CLI_RENDERER', 'fullscreen');
    expect(
      resolveRenderer({
        renderer: 'default',
        configRenderer: 'fullscreen',
      }),
    ).toBe('default');
  });

  it('uses persisted config when CLI is silent', () => {
    expect(resolveRenderer({ configRenderer: 'fullscreen' })).toBe('fullscreen');
  });

  it('lets config override env opt-in', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', '1');
    expect(resolveRenderer({ configRenderer: 'default' })).toBe('default');
  });

  it('opts into fullscreen from SPARK_CLI_NO_FLICKER', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', '1');
    expect(resolveRenderer({})).toBe('fullscreen');
  });

  it('forces default when SPARK_CLI_DISABLE_ALTERNATE_SCREEN is set', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', '1');
    vi.stubEnv('SPARK_CLI_DISABLE_ALTERNATE_SCREEN', '1');
    expect(resolveRenderer({})).toBe('default');
  });

  it('supports --fullscreen flag alias', () => {
    expect(resolveRenderer({ fullscreen: true })).toBe('fullscreen');
  });

  it('supports deprecated --no-ink alias', () => {
    vi.stubEnv('SPARK_CLI_RENDERER', 'fullscreen');
    expect(resolveRenderer({ noInk: true })).toBe('default');
  });
});
