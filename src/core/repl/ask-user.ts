import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import type { AskUserFn, AskUserRequest } from '../agent/tool-permissions.js';
import { accent, accentBold } from './theme.js';
import { ensureRawStdin } from './restore-input.js';

/**
 * REPL implementation of `ask_user_question`.
 *
 * Renders each question as a styled card with numbered options.
 * Accepts a single number for single-select or comma-separated numbers
 * for multi-select. Empty input is treated as "skipped".
 */
export const askUserInRepl: AskUserFn = async (req: AskUserRequest) => {
  const rl = readline.createInterface({ input, output, terminal: true });
  const askLine = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a)));
  const answers = [];

  try {
    for (const q of req.questions) {
      output.write('\n');
      if (q.header) {
        output.write(accentBold(`  [${q.header}]`) + '\n');
      }
      output.write(chalk.bold(`  ${q.question}\n`));

      q.options.forEach((opt, i) => {
        const num = accent(` ${i + 1} `);
        const desc = opt.description ? chalk.dim(` — ${opt.description}`) : '';
        output.write(`    ${num} ${opt.label}${desc}\n`);
      });

      const hint = q.multiSelect
        ? chalk.dim('  (comma-separated numbers, empty to skip) ')
        : chalk.dim('  (number, empty to skip) ');
      const raw = (await askLine(`${hint}❯ `)).trim();
      const selected: string[] = [];
      if (raw.length > 0) {
        const picks = q.multiSelect ? raw.split(/[,\s]+/) : [raw];
        for (const p of picks) {
          const idx = Number.parseInt(p, 10) - 1;
          if (Number.isInteger(idx) && idx >= 0 && idx < q.options.length) {
            selected.push(q.options[idx]!.label);
          }
        }
      }
      answers.push({ question: q.question, selected });
    }
  } finally {
    rl.close();
    ensureRawStdin();
  }

  return { answers };
};
