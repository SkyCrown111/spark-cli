import { describe, it, expect, vi } from 'vitest';
import { stripAnsi } from './terminal.js';
import { renderMarkdown, StreamingRenderer } from './markdown-renderer.js';
import { printAssistantBlock } from './transcript.js';

describe('transcript', () => {
  it('markdown renderer produces output for simple text', () => {
    const out = renderMarkdown('Hello from SparkCLI assistant.');
    const plain = stripAnsi(out);
    expect(plain).toContain('Hello');
  });

  it('markdown renderer handles code blocks', () => {
    const out = renderMarkdown('```js\nconsole.log("hi");\n```');
    const plain = stripAnsi(out);
    expect(plain).toContain('console.log');
  });

  it('markdown renderer handles bold and headers', () => {
    const out = renderMarkdown('## Title\n\nSome **bold** text');
    const plain = stripAnsi(out);
    expect(plain).toContain('Title');
    expect(plain).toContain('bold');
  });

  it('StreamingRenderer flushes remaining buffer', () => {
    const sr = new StreamingRenderer();
    sr.push('Hello world');
    const flushed = sr.flush();
    const plain = stripAnsi(flushed);
    expect(plain).toContain('Hello');
  });

  it('assistant block uses a clean lead bullet instead of branch glyphs', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      lines.push(String(value ?? ''));
    });

    printAssistantBlock('Hello\n\nWorld');
    spy.mockRestore();

    const plain = lines.map((line) => stripAnsi(line));
    expect(plain[0]).toMatch(/\s[*•] Hello/);
    expect(plain.join('\n')).not.toContain('└');
    expect(plain.join('\n')).not.toContain('\\');
  });
});
