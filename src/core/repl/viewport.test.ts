import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTtyViewport, shouldUseAlternateScreen, watchTtyResize } from './viewport.js';

describe('viewport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears with home + erase display', () => {
    const writes: string[] = [];
    const stdout = {
      isTTY: true,
      columns: 120,
      rows: 40,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as NodeJS.WriteStream;

    clearTtyViewport(stdout);
    expect(writes[0]).toBe('\x1b[2J\x1b[3J\x1b[H\x1b[2J');
    expect(writes.some((w) => w.includes('H'))).toBe(true);
  });

  it('erases scrollback too', () => {
    const writes: string[] = [];
    const stdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as NodeJS.WriteStream;

    clearTtyViewport(stdout);
    expect(writes.join('')).toContain('\x1b[2J');
    expect(writes.join('')).toContain('\x1b[3J');
  });

  it('never uses alternate screen in default renderer', () => {
    vi.stubEnv('SPARK_CLI_ALT_SCREEN', '1');
    expect(shouldUseAlternateScreen()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('debounces dimension changes from resize event', () => {
    if (!process.stdout.isTTY) return;

    vi.useFakeTimers();
    let cols = 80;
    const prevDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      get: () => cols,
    });

    const handler = vi.fn();
    const unwatch = watchTtyResize(handler, { debounceMs: 50, pollMs: 0 });

    cols = 100;
    process.stdout.emit('resize');
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(handler).toHaveBeenCalledTimes(1);

    unwatch();
    if (prevDescriptor) {
      Object.defineProperty(process.stdout, 'columns', prevDescriptor);
    }
    vi.useRealTimers();
  });
});
