import type { Completer } from 'node:readline';
import type { SlashRegistry } from '../slash/registry.js';
import type { ShellState } from '../../commands/shell.js';
import { isPlanMode } from '../slash/plan-mode.js';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { accent, accentBold, frameDim } from './theme.js';
import { displayWidth, frameChars, supportsUnicodeUi, terminalWidth } from './terminal.js';

/** Lines below prompt: border, mode row, footer. */
export const INPUT_CHROME_LINES_BELOW = 3;

/** Offset from prompt row to the mode line (for Shift+Tab rewrite). */
export const MODE_LINE_OFFSET = 2;

const INPUT_PLACEHOLDER = 'Try "create a util logging.py that..."';

export function createSlashCompleter(registry: SlashRegistry): Completer {
  const names = registry.list().map((c) => c.name);

  return (line: string): [string[], string] => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('/')) {
      return [[], line];
    }
    const body = trimmed.slice(1);
    const space = body.indexOf(' ');
    const cmdPart = space === -1 ? body : body.slice(0, space);
    const rest = space === -1 ? '' : body.slice(space);

    const hits = names
      .filter((n) => n.startsWith(cmdPart.toLowerCase()) || n.startsWith(cmdPart))
      .map((n) => `/${n}${rest}`);

    return [hits.length ? hits : [`/${cmdPart}`], line];
  };
}

function inputRule(width: number): string {
  const inner = Math.max(12, width - 4);
  return frameDim('  ' + frameChars().horizontal.repeat(inner));
}

export function printInputTopRule(): void {
  logger.info('');
  logger.info(inputRule(terminalWidth()));
}

export function printInputChromeBelow(state: ShellState): void {
  logger.info(inputRule(terminalWidth()));
  logger.info(formatModeLine(state));
  logger.info(formatInputFooterLine());
}

export function rewriteModeLine(state: ShellState): void {
  const down = `\x1b[${MODE_LINE_OFFSET}B`;
  const up = `\x1b[${MODE_LINE_OFFSET}A`;
  process.stdout.write(`${down}\r\x1b[K${formatModeLine(state)}${up}`);
}

function formatModeLeft(state: ShellState): string {
  const arrows = accent('▶▶ ');
  if (isPlanMode(state.plan)) {
    return arrows + chalk.hex('#2DD4BF').bold('plan mode on') + chalk.dim(' (shift+tab to cycle)');
  }
  if (state.writeMode === 'direct') {
    return arrows + accentBold('accept edits on') + chalk.dim(' (shift+tab to cycle)');
  }
  return chalk.dim('? for shortcuts');
}

function formatModeRight(state: ShellState): string {
  const parts: string[] = [];

  if (isPlanMode(state.plan)) {
    parts.push(accent('auto mode is unavailable for your plan'));
  }

  if (state.tokenUsage) {
    parts.push(formatTokenUsage(state.tokenUsage));
  }

  return parts.join(chalk.dim(' · '));
}

/** Compact token count for status line (e.g. 8.0k, 1M). */
export function formatTokenCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Format token usage as a compact status bar. */
function formatTokenUsage(usage: TokenUsageInfo): string {
  const { used, budget } = usage;
  const pct = budget > 0 ? Math.max(0, Math.min(100, Math.round((used / budget) * 100))) : 0;
  const usedLabel = formatTokenCompact(used);
  const budgetLabel = formatTokenCompact(budget);
  const bar = renderTokenBar(pct);

  const pctColor =
    pct > 90 ? chalk.hex('#F87171') : pct > 70 ? chalk.hex('#FBBF24') : chalk.hex('#9CA3AF');

  return chalk.dim('ctx ') + bar + chalk.dim(` ${usedLabel}/${budgetLabel} `) + pctColor(`${pct}%`);
}

function renderTokenBar(pct: number): string {
  const width = 14;
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  const empty = width - filled;
  const fillChar = supportsUnicodeUi() ? '█' : '#';
  /** Spaces (not dashes) so 0% reads as an empty bar, not a full one. */
  const emptyChar = ' ';
  const fillColor =
    pct > 90 ? chalk.hex('#F87171') : pct > 70 ? chalk.hex('#FBBF24') : chalk.hex('#94A3B8');

  return (
    chalk.dim('[') +
    (filled > 0 ? fillColor(fillChar.repeat(filled)) : '') +
    chalk.dim(emptyChar.repeat(empty)) +
    chalk.dim(']')
  );
}

export function formatModeLine(state: ShellState): string {
  const w = terminalWidth();
  const left = formatModeLeft(state);
  const right = formatModeRight(state);
  const available = Math.max(0, w - 2);

  if (!right) {
    return '  ' + left;
  }

  const rightWidth = displayWidth(right);
  const leftWidth = displayWidth(left);

  if (rightWidth >= available) {
    return '  ' + right;
  }

  const minGap = 2;
  const total = leftWidth + minGap + rightWidth;
  if (total > available) {
    return ' '.repeat(Math.max(2, w - rightWidth - 2)) + right;
  }

  const pad = Math.max(minGap, available - leftWidth - rightWidth);
  return '  ' + left + ' '.repeat(pad) + right;
}

/** `esc to interrupt` under the mode row (Claude Code). */
export function formatInputFooterLine(message = 'esc to interrupt'): string {
  return chalk.dim(`  ${message}`);
}

export function formatReplPrompt(_state: ShellState, withPlaceholder = false): string {
  const p = accentBold('> ');
  if (!withPlaceholder) return p;
  return p + chalk.dim(INPUT_PLACEHOLDER);
}

export function formatModeHint(state: ShellState): string {
  return formatModeLine(state);
}

/** Token usage info for the mode line display. */
export interface TokenUsageInfo {
  used: number;
  budget: number;
}
