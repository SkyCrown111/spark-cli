import { describe, it, expect, vi, afterEach } from 'vitest';
import { InputBox } from './input-box.js';

describe('InputBox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the box and chrome on separate lines', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const box = new InputBox({
      placeholder: 'hello',
      onRenderChrome: () => 0,
    });

    box.show();

    expect(writes[0]).toBe('\n');
    expect(writes[1]).toContain('\n');
  });

  it('moves cursor left and right without redrawing from block end', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const box = new InputBox({
      placeholder: 'hello',
      onRenderChrome: () => 0,
    });

    box.show();
    writes.length = 0;

    box.handleKey('a', { name: 'a' });
    box.handleKey('b', { name: 'b' });
    writes.length = 0;

    box.handleKey(undefined, { name: 'left' });
    box.handleKey(undefined, { name: 'right' });

    expect(writes.some((w) => w.includes('\x1b[3C'))).toBe(true);
    expect(writes.some((w) => w.includes('\x1b[4C'))).toBe(true);
    expect(writes.some((w) => w.includes('\x1b[J'))).toBe(false);
  });

  it('accounts for double-width chinese characters when positioning the cursor', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const box = new InputBox({
      placeholder: 'hello',
      onRenderChrome: () => 0,
    });

    box.show();
    writes.length = 0;

    box.handleKey('你', { name: '你' });
    box.handleKey('好', { name: '好' });

    expect(writes.some((w) => w.includes('\x1b[6C'))).toBe(true);
  });

  it('suspend and resume preserve draft text across rerender', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const box = new InputBox({ onRenderChrome: () => 0 });
    box.show();
    box.handleKey('h', { name: 'h' });
    box.handleKey('i', { name: 'i' });

    const draft = box.suspendForRerender();
    expect(draft).toEqual({ buffer: 'hi', cursorPos: 2 });
    expect(box.isVisible).toBe(false);

    writes.length = 0;
    box.resumeAfterRerender(draft!);
    expect(box.text).toBe('hi');
    expect(box.isVisible).toBe(true);
    expect(writes[0]).toBe('\n');
  });
});
