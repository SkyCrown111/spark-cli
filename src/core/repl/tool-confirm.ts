import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import type { ToolConfirmRequest } from '../agent/tool-permissions.js';
import { accent, accentBold, frame } from './theme.js';
import { frameChars, terminalWidth } from './terminal.js';

export type ToolConfirmAnswer = 'allow' | 'deny' | 'allow-always';

export function askToolConfirm(req: ToolConfirmRequest): Promise<ToolConfirmAnswer> {
  const rl = readline.createInterface({ input, output, terminal: true });

  const w = terminalWidth();
  const inner = Math.max(28, w - 6);
  const chars = frameChars();
  const toolLabel = accentBold(req.tool);
  const argsPart = req.argsSummary ? chalk.dim(` ${truncate(req.argsSummary, inner - req.tool.length - 4)}`) : '';

  // Top border
  const topLine =
    frame(`${chars.topLeft}${chars.horizontal} `) +
    accent('Tool Permission') +
    frame(` ${chars.horizontal.repeat(Math.max(0, inner - 18))}${chars.topRight}`);
  // Content line
  const contentLine = frame(`${chars.vertical} `) + toolLabel + argsPart + frame(` ${chars.vertical}`);
  // Options line
  const options =
    chalk.dim(`${chars.vertical}  `) +
    chalk.green('[y]') +
    chalk.dim(' allow  ') +
    chalk.red('[n]') +
    chalk.dim(' deny  ') +
    chalk.hex('#FBBF24')('[a]') +
    chalk.dim(' always') +
    frame(` ${chars.vertical}`);
  // Bottom border
  const bottomLine = frame(chars.bottomLeft + chars.horizontal.repeat(inner + 2) + chars.bottomRight);

  const q = [
    '',
    topLine,
    contentLine,
    options,
    bottomLine,
    '',
    chalk.dim('  ❯ '),
  ].join('\n');

  return new Promise((resolve) => {
    output.write(q);
    rl.question('', (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'a' || a === 'always') resolve('allow-always');
      else if (a === 'y' || a === 'yes') resolve('allow');
      else resolve('deny');
    });
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + frameChars().ellipsis;
}
