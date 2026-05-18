/**
 * Multi-line input box for the REPL.
 *
 * Replaces the basic readline single-line prompt with a visual input box that:
 * - Has a bordered frame around the typing area
 * - Supports multi-line input (Shift+Enter / Option+Enter for new line)
 * - Shows placeholder text when empty
 * - Word-wraps within the box
 * - Supports Tab completion for slash commands
 * - Redraws efficiently on each keystroke
 */

import type { Completer } from 'node:readline';
import chalk from 'chalk';
import { accentBold, frameDim } from './theme.js';
import { displayWidth, frameChars, terminalWidth } from './terminal.js';
import { showReplCursor } from './viewport.js';
import { formatModeLine, formatInputFooterLine } from './repl-ui.js';

const PLACEHOLDER = 'Try "create a util logging.py that..."';
const INPUT_PREFIX = '> ';
const CONTINUATION_PREFIX = '  ';
const PAD_RIGHT = 1;

export interface InputBoxOptions {
  completer?: Completer;
  placeholder?: string;
  onRenderChrome?: () => number;
}

export interface InputBoxDraft {
  buffer: string;
  cursorPos: number;
}

export class InputBox {
  private buffer = '';
  private cursorPos = 0;
  private lastCursorVisual = { row: 0, col: 0 };
  private completer: Completer | undefined;
  private placeholder: string;
  private contentLines = 1;
  private visible = false;
  private chromeLinesBelow = 0;
  private onRenderChrome: (() => number) | undefined;

  constructor(opts: InputBoxOptions = {}) {
    this.completer = opts.completer;
    this.placeholder = opts.placeholder ?? PLACEHOLDER;
    this.onRenderChrome = opts.onRenderChrome;
  }

  private contentWidth(): number {
    const w = terminalWidth();
    return Math.max(12, w - 4 - INPUT_PREFIX.length - PAD_RIGHT);
  }

  private cursorVisualPosition(): { row: number; col: number } {
    const cw = this.contentWidth();
    const textBeforeCursor = this.buffer.slice(0, this.cursorPos);
    let row = 0;
    let col = 0;

    for (const segment of textBeforeCursor.split('\n')) {
      const segmentWidth = displayWidth(segment);
      if (row > 0 || segmentWidth > 0) {
        const segRows = Math.max(1, Math.ceil(segmentWidth / cw));
        if (segmentWidth === 0) {
          row += 1;
          col = 0;
        } else {
          row += segRows - 1;
          col = segmentWidth % cw;
          if (col === 0 && segRows > 1) col = cw;
        }
      }
    }

    return { row, col };
  }

  private calcContentLines(): number {
    if (this.buffer.length === 0) return 1;
    const cw = this.contentWidth();
    let lines = 0;
    for (const seg of this.buffer.split('\n')) {
      lines += Math.max(1, Math.ceil(displayWidth(seg) / cw));
    }
    return Math.max(1, lines);
  }

  render(): string {
    const w = terminalWidth();
    const inner = Math.max(16, w - 4);
    const cw = this.contentWidth();
    const chars = frameChars();

    const lines: string[] = [];
    lines.push(frameDim(chars.horizontal.repeat(inner)));

    if (this.buffer.length === 0) {
      const ph = this.fitToWidth(this.placeholder, cw);
      const padded = ph + ' '.repeat(Math.max(0, cw - displayWidth(ph)));
      lines.push(accentBold(INPUT_PREFIX) + chalk.dim(padded) + ' '.repeat(PAD_RIGHT));
    } else {
      const wrapped = this.wrapText(this.buffer, cw);
      for (const [index, row] of wrapped.entries()) {
        const padded = row + ' '.repeat(Math.max(0, cw - displayWidth(row)));
        const prefix = index === 0 ? accentBold(INPUT_PREFIX) : CONTINUATION_PREFIX;
        lines.push(prefix + padded + ' '.repeat(PAD_RIGHT));
      }
    }

    lines.push(frameDim(chars.horizontal.repeat(inner)));

    this.contentLines = this.calcContentLines();
    return lines.join('\n');
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const rows: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (paragraph.length === 0) {
        rows.push('');
        continue;
      }
      rows.push(...this.wrapParagraph(paragraph, maxWidth));
    }
    return rows.length > 0 ? rows : [''];
  }

  private wrapParagraph(text: string, maxWidth: number): string[] {
    const rows: string[] = [];
    let current = '';
    let currentWidth = 0;
    let lastBreakIndex = -1;

    for (const ch of text) {
      const chWidth = displayWidth(ch);
      if (currentWidth + chWidth > maxWidth && current.length > 0) {
        if (lastBreakIndex >= 0) {
          const row = current.slice(0, lastBreakIndex);
          rows.push(row);
          current = current.slice(lastBreakIndex).trimStart() + ch;
        } else {
          rows.push(current);
          current = ch;
        }
        currentWidth = displayWidth(current);
        lastBreakIndex = current.lastIndexOf(' ');
        continue;
      }

      current += ch;
      currentWidth += chWidth;
      if (ch === ' ') lastBreakIndex = current.length - 1;
    }

    if (current.length > 0) rows.push(current);
    return rows;
  }

  private fitToWidth(text: string, maxWidth: number): string {
    let out = '';
    let width = 0;
    for (const ch of text) {
      const chWidth = displayWidth(ch);
      if (width + chWidth > maxWidth) break;
      out += ch;
      width += chWidth;
    }
    return out;
  }

  show(): void {
    this.visible = true;
    this.buffer = '';
    this.cursorPos = 0;
    this.lastCursorVisual = { row: 0, col: 0 };
    this.chromeLinesBelow = 0;
    process.stdout.write('\n');
    this.paint();
  }

  reposCursor(chromeLinesPrinted = 0): void {
    if (!this.visible) return;
    this.chromeLinesBelow = chromeLinesPrinted;
    this.moveCursorFromBlockEnd();
  }

  private paint(): void {
    process.stdout.write(this.render() + '\n');
    this.chromeLinesBelow = this.onRenderChrome ? this.onRenderChrome() : 0;
    this.moveCursorFromBlockEnd();
  }

  redraw(): void {
    if (!this.visible) return;
    process.stdout.write(`\x1b[${this.lastCursorVisual.row + 1}A\r\x1b[J`);
    this.paint();
  }

  /** After terminal resize — erase the whole input block (borders + chrome). */
  redrawOnResize(): void {
    if (!this.visible) return;
    const content = Math.max(this.contentLines, this.calcContentLines());
    const linesUp = 2 + content + this.chromeLinesBelow;
    process.stdout.write(`\x1b[${linesUp}A\r\x1b[J`);
    this.paint();
  }

  private moveCursorFromBlockEnd(): void {
    const { row, col } = this.cursorVisualPosition();
    const upFromBlockEnd = this.chromeLinesBelow + this.contentLines + 1 - row;
    process.stdout.write(`\x1b[${upFromBlockEnd}A`);

    const prefixWidth = row === 0 ? INPUT_PREFIX.length : CONTINUATION_PREFIX.length;
    const targetCol = prefixWidth + col;
    process.stdout.write(`\r\x1b[${targetCol}C`);
    this.lastCursorVisual = { row, col };
    showReplCursor();
  }

  private moveCursorFromCurrent(): void {
    const { row, col } = this.cursorVisualPosition();
    const rowDelta = row - this.lastCursorVisual.row;
    if (rowDelta < 0) process.stdout.write(`\x1b[${-rowDelta}A`);
    else if (rowDelta > 0) process.stdout.write(`\x1b[${rowDelta}B`);

    const prefixWidth = row === 0 ? INPUT_PREFIX.length : CONTINUATION_PREFIX.length;
    const targetCol = prefixWidth + col;
    process.stdout.write(`\r\x1b[${targetCol}C`);
    this.lastCursorVisual = { row, col };
    showReplCursor();
  }

  handleKey(
    chunk: string | undefined,
    key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean },
  ): string | null {
    if (!this.visible) return null;

    if (key.name === 'return' || key.name === 'enter') {
      if (key.shift || key.meta) {
        this.insertText('\n');
        return null;
      }
      return this.submit();
    }

    if (key.name === 'backspace') {
      if (this.cursorPos > 0) {
        this.buffer = this.buffer.slice(0, this.cursorPos - 1) + this.buffer.slice(this.cursorPos);
        this.cursorPos--;
        this.redraw();
      }
      return null;
    }

    if (key.name === 'delete') {
      if (this.cursorPos < this.buffer.length) {
        this.buffer = this.buffer.slice(0, this.cursorPos) + this.buffer.slice(this.cursorPos + 1);
        this.redraw();
      }
      return null;
    }

    if (key.name === 'left') {
      if (this.cursorPos > 0) {
        this.cursorPos--;
        this.moveCursorFromCurrent();
      }
      return null;
    }
    if (key.name === 'right') {
      if (this.cursorPos < this.buffer.length) {
        this.cursorPos++;
        this.moveCursorFromCurrent();
      }
      return null;
    }
    if (key.name === 'home') {
      this.cursorPos = 0;
      this.moveCursorFromCurrent();
      return null;
    }
    if (key.name === 'end') {
      this.cursorPos = this.buffer.length;
      this.moveCursorFromCurrent();
      return null;
    }

    if (key.name === 'tab' && !key.shift) {
      this.doComplete();
      return null;
    }

    if (chunk && chunk.length === 1 && !key.ctrl && !key.meta) {
      this.insertText(chunk);
      return null;
    }

    return null;
  }

  private insertText(text: string): void {
    this.buffer = this.buffer.slice(0, this.cursorPos) + text + this.buffer.slice(this.cursorPos);
    this.cursorPos += text.length;
    this.redraw();
  }

  private doComplete(): void {
    if (!this.completer) return;
    const [completions] = this.completer(this.buffer.slice(0, this.cursorPos));
    if (completions.length === 1) {
      const completion = completions[0]!;
      this.buffer = completion + this.buffer.slice(this.cursorPos);
      this.cursorPos = completion.length;
      this.redraw();
    } else if (completions.length > 1) {
      let prefix = completions[0]!;
      for (const c of completions.slice(1)) {
        while (!c.startsWith(prefix) && prefix.length > 0) {
          prefix = prefix.slice(0, -1);
        }
      }
      if (prefix.length > this.buffer.slice(0, this.cursorPos).length) {
        this.buffer = prefix + this.buffer.slice(this.cursorPos);
        this.cursorPos = prefix.length;
        this.redraw();
      }
    }
  }

  submit(): string {
    const text = this.buffer;
    this.visible = false;
    this.buffer = '';
    this.cursorPos = 0;
    process.stdout.write(`\x1b[${this.lastCursorVisual.row + 1}A\r\x1b[J`);
    this.chromeLinesBelow = 0;
    this.lastCursorVisual = { row: 0, col: 0 };
    return text;
  }

  hide(): void {
    if (!this.visible) return;
    process.stdout.write(`\x1b[${this.lastCursorVisual.row + 1}A\r\x1b[J`);
    this.visible = false;
  }

  reshow(): void {
    this.visible = true;
    this.paint();
  }

  /** Save draft input and hide before a full-screen rerender (no partial erase). */
  suspendForRerender(): InputBoxDraft | undefined {
    if (!this.visible) return undefined;
    const draft = { buffer: this.buffer, cursorPos: this.cursorPos };
    this.visible = false;
    return draft;
  }

  /** Restore draft input after a full-screen rerender. */
  resumeAfterRerender(draft: InputBoxDraft): void {
    this.buffer = draft.buffer;
    this.cursorPos = draft.cursorPos;
    this.visible = true;
    this.lastCursorVisual = { row: 0, col: 0 };
    this.chromeLinesBelow = 0;
    process.stdout.write('\n');
    this.paint();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get text(): string {
    return this.buffer;
  }
}

export function printInputBoxChrome(
  state: import('../../commands/shell.js').ShellState,
  footerMessage?: string,
): number {
  process.stdout.write(`${formatModeLine(state)}\n`);
  process.stdout.write(`${formatInputFooterLine(footerMessage)}\n`);
  return 2;
}
