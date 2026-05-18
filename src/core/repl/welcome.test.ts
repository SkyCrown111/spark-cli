import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderReplWelcome } from './welcome.js';
import { stripAnsi, terminalWidth } from './terminal.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderReplWelcome', () => {
  it('renders a compact welcome card', () => {
    const out = renderReplWelcome({
      info: {
        projectRoot: '/proj/game',
        engine: 'cocos-creator',
        modelLine: 'openai/gpt-4o',
        writeModeLabel: 'staging (safe)',
        version: '0.3.0-dev',
      },
    });
    const plain = stripAnsi(out);
    expect(plain).toContain('Welcome back!');
    expect(plain).toContain('SparkCLI v0.3.0-dev');
    expect(plain).toContain('/help, @file, Shift+Tab');
    expect(plain).toContain('cocos-creator');
    expect(plain).toContain('staging');
    expect(plain).not.toContain('Recent activity');
  });

  it('expands the welcome card when the terminal is wide', () => {
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 160,
    });

    const out = renderReplWelcome({
      info: {
        projectRoot: '/proj/game',
        engine: 'cocos-creator',
        modelLine: 'openai/gpt-4o',
        writeModeLabel: 'staging (safe)',
        version: '0.3.0-dev',
      },
    });

    const plain = stripAnsi(out);
    const lines = plain.split('\n').filter(Boolean);
    expect(terminalWidth()).toBe(160);
    expect(lines[0]?.length).toBeGreaterThan(120);
  });

  it('falls back to a stacked layout on narrow terminals', () => {
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 52,
    });

    const out = renderReplWelcome({
      info: {
        projectRoot: '/proj/game',
        engine: 'cocos-creator',
        modelLine: 'mimo/mimo-v2.5-pro',
        writeModeLabel: 'staging (safe)',
        version: '0.3.0-dev',
      },
    });

    const plain = stripAnsi(out);
    expect(plain).toContain('Welcome back!');
    expect(plain).toContain('mimo/mimo-v2.5-pro');
  });
});
