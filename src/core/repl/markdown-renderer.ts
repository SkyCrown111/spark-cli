/**
 * Minimal terminal markdown renderer for the REPL.
 */

import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import { ACCENT, FRAME_DIM } from './theme.js';
import { terminalWidth } from './terminal.js';

function createRenderer(width: number): Marked {
  const themedMarked = new Marked();
  themedMarked.use(
    markedTerminal(
      {
        width,
        reflowText: true,
        showSectionPrefix: false,
        emoji: false,
        tab: 2,
        code: chalk.hex('#C4B5FD'),
        blockquote: chalk.hex(FRAME_DIM),
        heading: chalk.white.bold,
        firstHeading: chalk.white.bold,
        hr: chalk.hex(FRAME_DIM),
        listitem: chalk.reset,
        table: chalk.reset,
        paragraph: chalk.reset,
        strong: chalk.white.bold,
        em: chalk.dim.italic,
        codespan: chalk.hex(ACCENT),
        del: chalk.dim.strikethrough,
        link: chalk.white,
        href: chalk.hex(ACCENT).underline,
      },
      { theme: 'github' },
    ),
  );
  return themedMarked;
}

/** Render a complete markdown string to terminal ANSI output. */
export function renderMarkdown(text: string): string {
  const width = Math.max(20, terminalWidth() - 6);
  return createRenderer(width).parse(text) as string;
}

/**
 * Kept for compatibility with older tests and call sites.
 * The REPL no longer uses streamed markdown rendering.
 */
export class StreamingRenderer {
  private buffer = '';

  push(delta: string): { rendered: string; raw: string } {
    this.buffer += delta;
    return { rendered: '', raw: delta };
  }

  flush(): string {
    if (!this.buffer) return '';
    const remaining = this.buffer;
    this.buffer = '';
    return renderMarkdown(remaining);
  }
}
