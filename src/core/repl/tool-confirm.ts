import chalk from 'chalk';
import type { ToolConfirmRequest } from '../agent/tool-permissions.js';
import { accent, accentBold, frame } from './theme.js';
import { frameChars, terminalWidth } from './terminal.js';
import { setReplModalHandler, type ReplKeypress } from './repl-prompt-bridge.js';

export type ToolConfirmAnswer = 'allow' | 'deny' | 'allow-always';

const OPTIONS: Array<{ answer: ToolConfirmAnswer; label: string; hint: string }> = [
  { answer: 'allow', label: '允许本次', hint: '1' },
  { answer: 'deny', label: '拒绝', hint: '2' },
  { answer: 'allow-always', label: '始终允许此工具', hint: '3' },
];

let confirmChain: Promise<unknown> = Promise.resolve();

/** Serialize permission prompts (parallel tool calls must not stack UIs). */
function enqueueConfirm<T>(fn: () => Promise<T>): Promise<T> {
  const next = confirmChain.then(fn, fn);
  confirmChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function askToolConfirm(req: ToolConfirmRequest): Promise<ToolConfirmAnswer> {
  return enqueueConfirm(() => promptToolConfirmInteractive(req));
}

function promptToolConfirmInteractive(req: ToolConfirmRequest): Promise<ToolConfirmAnswer> {
  return new Promise((resolve) => {
    let selected = 0;
    let cardLines = 0;
    let settled = false;

    const paint = (): void => {
      if (cardLines > 0) {
        process.stdout.write(`\x1b[${cardLines}A\r\x1b[J`);
      }
      const lines = renderConfirmCard(req, selected);
      cardLines = lines.length;
      process.stdout.write(`${lines.join('\n')}\n`);
    };

    const finish = (answer: ToolConfirmAnswer): void => {
      if (settled) return;
      settled = true;
      setReplModalHandler(null);
      if (cardLines > 0) {
        process.stdout.write(`\x1b[${cardLines}A\r\x1b[J`);
        cardLines = 0;
      }
      resolve(answer);
    };

    const handler = (chunk: string | undefined, key: ReplKeypress): boolean => {
      if (key.name === 'up') {
        selected = (selected - 1 + OPTIONS.length) % OPTIONS.length;
        paint();
        return true;
      }
      if (key.name === 'down') {
        selected = (selected + 1) % OPTIONS.length;
        paint();
        return true;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish(OPTIONS[selected]!.answer);
        return true;
      }
      if (key.name === 'escape') {
        finish('deny');
        return true;
      }
      const ch = chunk?.trim();
      if (ch === '1') {
        finish('allow');
        return true;
      }
      if (ch === '2') {
        finish('deny');
        return true;
      }
      if (ch === '3') {
        finish('allow-always');
        return true;
      }
      return true;
    };

    try {
      paint();
      setReplModalHandler(handler);
    } catch (e) {
      finish('deny');
      throw e;
    }
  });
}

/** For tests: route keys without a live TTY. */
export function resolveToolConfirmKey(
  selected: number,
  chunk: string | undefined,
  key: ReplKeypress,
): { selected: number; answer?: ToolConfirmAnswer } {
  let next = selected;
  if (key.name === 'up') next = (selected - 1 + OPTIONS.length) % OPTIONS.length;
  else if (key.name === 'down') next = (selected + 1) % OPTIONS.length;
  else if (key.name === 'return' || key.name === 'enter') {
    return { selected: next, answer: OPTIONS[next]!.answer };
  } else if (key.name === 'escape') {
    return { selected: next, answer: 'deny' };
  } else if (chunk?.trim() === '1') return { selected: next, answer: 'allow' };
  else if (chunk?.trim() === '2') return { selected: next, answer: 'deny' };
  else if (chunk?.trim() === '3') return { selected: next, answer: 'allow-always' };
  return { selected: next };
}

export function renderConfirmCard(req: ToolConfirmRequest, selected: number): string[] {
  const w = terminalWidth();
  const inner = Math.max(28, w - 6);
  const chars = frameChars();
  const toolLabel = accentBold(req.tool);
  const argsPart = req.argsSummary
    ? chalk.dim(` ${truncate(req.argsSummary, inner - req.tool.length - 4)}`)
    : '';

  const lines: string[] = [];
  lines.push(
    frame(`${chars.topLeft}${chars.horizontal} `) +
      accent('Tool Permission') +
      frame(` ${chars.horizontal.repeat(Math.max(0, inner - 18))}${chars.topRight}`),
  );
  lines.push(frame(`${chars.vertical} `) + toolLabel + argsPart + frame(` ${chars.vertical}`));
  lines.push(frame(`${chars.vertical} `) + chalk.dim('选择操作 (↑↓ 或按 1/2/3，Enter 确认)') + frame(` ${chars.vertical}`));

  for (let i = 0; i < OPTIONS.length; i++) {
    const opt = OPTIONS[i]!;
    const active = i === selected;
    const pointer = active ? accent('❯ ') : chalk.dim('  ');
    const num = active ? accentBold(` ${opt.hint} `) : chalk.dim(` ${opt.hint} `);
    const label = active ? chalk.bold(opt.label) : chalk.dim(opt.label);
    const row = `${pointer}${num} ${label}`;
    const pad = Math.max(0, inner - stripVisibleLength(row) + 2);
    lines.push(frame(`${chars.vertical} `) + row + ' '.repeat(pad) + frame(` ${chars.vertical}`));
  }

  lines.push(frame(chars.bottomLeft + chars.horizontal.repeat(inner + 2) + chars.bottomRight));
  return lines;
}

function stripVisibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + frameChars().ellipsis;
}
