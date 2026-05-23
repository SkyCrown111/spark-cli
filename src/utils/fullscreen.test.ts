import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFullscreenEnvEnabled } from './fullscreen.js';

describe('isFullscreenEnvEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to inline mode so terminal scrollback is preserved', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', '');
    expect(isFullscreenEnvEnabled()).toBe(false);
  });

  it('enables fullscreen only when explicitly opted in', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', '1');
    expect(isFullscreenEnvEnabled()).toBe(true);
  });

  it('respects explicit opt-out values', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', 'false');
    expect(isFullscreenEnvEnabled()).toBe(false);
  });
});
