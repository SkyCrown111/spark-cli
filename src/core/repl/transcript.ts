/**
 * Claude Code-style REPL transcript.
 */

import chalk from 'chalk';
import { accent, accentBold, frameDim } from './theme.js';
import { frameChars, stripAnsi, supportsUnicodeUi, terminalWidth } from './terminal.js';
import { renderMarkdown } from './markdown-renderer.js';

const USER_BAR_BG = '#2D2D2D';
const ERR_COLOR = '#F9A8D4';
const TOOL_OK = '#4ADE80';
const TOOL_ERR = '#F87171';
const TOOL_PENDING = '#FBBF24';
const THINKING_FRAMES = ['·', '•', '◦', '•'] as const;

export interface ThinkingSpinner {
  stop(): void;
}

function padBar(inner: string, width: number): string {
  const vis = stripAnsi(inner);
  if (vis.length >= width) return inner.slice(0, width + (inner.length - vis.length));
  return inner + ' '.repeat(width - vis.length);
}

function assistantBullet(): string {
  return supportsUnicodeUi() ? '•' : '*';
}

/** Thin rule between welcome card and conversation. */
export function printTranscriptSeparator(): void {
  const w = terminalWidth();
  console.log(chalk.hex('#52525B')('  ' + frameChars().horizontal.repeat(Math.max(12, w - 4))));
}

/** User turn as a full-width gray bar with `> text`. */
export function printUserTurn(text: string): void {
  const w = terminalWidth();
  const inner = Math.max(12, w - 4);
  const body = padBar(chalk.white('> ' + text), inner);
  console.log('  ' + chalk.bgHex(USER_BAR_BG)(body));
}

/** Static thinking status fallback. */
export function printThinkingStatus(label = 'Concocting...'): void {
  console.log(accent(`  ${frameChars().middleDot} `) + accentBold(label));
}

/** Animated thinking status similar to Claude Code. */
export function startThinkingSpinner(label = 'Concocting...'): ThinkingSpinner {
  const frames = supportsUnicodeUi() ? THINKING_FRAMES : (['*', '+', '.', '+'] as const);
  let index = 0;
  let active = true;

  const render = () => {
    const frame = frames[index % frames.length]!;
    process.stdout.write(`\r\x1b[K${accent(`  ${frame} `)}${accentBold(label)}`);
    index += 1;
  };

  render();
  const timer = setInterval(render, 120);
  timer.unref?.();

  return {
    stop() {
      if (!active) return;
      active = false;
      clearInterval(timer);
      process.stdout.write('\r\x1b[K');
    },
  };
}

/** Assistant reply block with a single clean lead bullet. */
export function printAssistantBlock(text: string): void {
  const rendered = renderMarkdown(text);
  const lines = rendered.split('\n');
  let usedLeadBullet = false;

  for (const line of lines) {
    if (line.trim() === '') {
      console.log('');
      continue;
    }

    if (!usedLeadBullet) {
      console.log(`  ${chalk.white(assistantBullet())} ${line}`);
      usedLeadBullet = true;
      continue;
    }

    console.log(`    ${line}`);
  }

  if (!usedLeadBullet) {
    console.log(`  ${chalk.white(assistantBullet())} ${chalk.dim('(no content)')}`);
  }
}

/** Error / API message. */
export function printAssistantError(message: string): void {
  const short = message.split('\n')[0] ?? message;
  console.log(`  ${chalk.hex(ERR_COLOR)(assistantBullet())} ${chalk.hex(ERR_COLOR)(short)}`);
}

/** Ctrl+C interrupt acknowledgement. */
export function printInterrupted(): void {
  console.log(
    chalk.hex(TOOL_PENDING)(`  ${assistantBullet()} `) +
      chalk.white('Interrupted') +
      chalk.dim(` ${frameChars().middleDot} What should SparkCLI do instead?`),
  );
}

/** @deprecated Use {@link printToolBatch} — one compact line per tool round. */
export function printToolIteration(_iteration: number, tools: string): void {
  console.log(chalk.dim(`  ${frameChars().middleDot} ${tools}`));
}

export interface ToolBatchCall {
  tool: string;
  durationMs: number;
  isError: boolean;
}

/** Group parallel tool calls into a single Claude Code–style line. */
export function summarizeToolBatch(calls: ToolBatchCall[]): {
  label: string;
  errorCount: number;
  totalMs: number;
} {
  const byTool = new Map<string, { count: number; errors: number }>();
  let totalMs = 0;
  let errorCount = 0;
  for (const c of calls) {
    totalMs += c.durationMs;
    if (c.isError) errorCount++;
    const prev = byTool.get(c.tool) ?? { count: 0, errors: 0 };
    prev.count++;
    if (c.isError) prev.errors++;
    byTool.set(c.tool, prev);
  }
  const parts: string[] = [];
  for (const [tool, stat] of byTool) {
    if (stat.errors > 0) {
      parts.push(
        stat.count > 1 ? `${tool}×${stat.count} (${stat.errors} failed)` : `${tool} (failed)`,
      );
    } else {
      parts.push(stat.count > 1 ? `${tool}×${stat.count}` : tool);
    }
  }
  return { label: parts.join(', '), errorCount, totalMs };
}

/**
 * Claude Code–style tool summary: one line per provider round, not one line per tool.
 * Example: `  ✓ read_file×4, todo_create×3  128ms`
 */
export function printToolBatch(calls: ToolBatchCall[]): void {
  if (calls.length === 0) return;
  const { label, errorCount, totalMs } = summarizeToolBatch(calls);
  const icon =
    errorCount > 0
      ? chalk.hex(TOOL_ERR)('✕')
      : chalk.hex(TOOL_OK)(supportsUnicodeUi() ? '✓' : '+');
  const errSuffix =
    errorCount > 0 ? chalk.hex(TOOL_ERR)(` · ${errorCount} failed`) : '';
  console.log(
    `  ${icon} ${chalk.dim(label)}${errSuffix} ${chalk.dim(formatDuration(totalMs))}`,
  );
}

/**
 * Print a live tool call start indicator.
 * Shows a spinning/pending state for a tool that is about to execute.
 */
export function printToolCallStart(tool: string, argsSummary?: string): void {
  const label = argsSummary ? `${tool} (${argsSummary})` : tool;
  const truncated = truncateToolLabel(label);
  process.stdout.write(chalk.hex(TOOL_PENDING)('  ○ ') + chalk.dim(truncated));
}

/**
 * Print a tool call completion indicator.
 * Overwrites the pending indicator with success/error status and duration.
 */
export function printToolCallEnd(tool: string, durationMs: number, isError: boolean): void {
  const icon = isError ? chalk.hex(TOOL_ERR)('✕') : chalk.hex(TOOL_OK)('✓');
  const duration = formatDuration(durationMs);
  const suffix = isError ? chalk.hex(TOOL_ERR)(' error') : chalk.dim(` ${duration}`);

  process.stdout.write(`\r\x1b[K  ${icon} ${chalk.dim(tool)}${suffix}\n`);
}

/** Print a completed tool call card (for non-streaming mode). */
export function printToolCallCard(
  tool: string,
  durationMs: number,
  isError: boolean,
  argsSummary?: string,
): void {
  const icon = isError ? chalk.hex(TOOL_ERR)('✕') : chalk.hex(TOOL_OK)('✓');
  const duration = formatDuration(durationMs);
  const label = argsSummary ? `${tool} (${truncateToolLabel(argsSummary)})` : tool;
  const suffix = isError ? chalk.hex(TOOL_ERR)(' error') : chalk.dim(` ${duration}`);

  console.log(`  ${icon} ${chalk.dim(label)}${suffix}`);
}

/** Duration / cook status after a long turn. */
export function printCookStatus(seconds: number): void {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const label = m > 0 ? `${m}m ${s}s` : `${s}s`;
  console.log(frameDim(`  * Sparked for ${label}`));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function truncateToolLabel(label: string, max = 60): string {
  const vis = stripAnsi(label);
  if (vis.length <= max) return label;
  return label.slice(0, max - 1) + frameChars().ellipsis;
}
