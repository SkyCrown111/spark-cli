import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';
import { getStagingDir } from '../../config/paths.js';
import { accent, frameDim } from '../repl/theme.js';

const PREVIEW_LINES = 8;

/** Action badge colors for diff display. */
const ACTION_COLORS: Record<string, (s: string) => string> = {
  create: chalk.hex('#4ADE80'),  // green
  modify: chalk.hex('#FBBF24'),  // amber
  delete: chalk.hex('#F87171'),  // red
};

export function summarizeStagedFileDiff(projectRoot: string, relPath: string): string | null {
  const staged = join(getStagingDir(projectRoot), 'files', relPath);
  if (!existsSync(staged)) return null;

  const target = join(projectRoot, relPath);
  const oldContent = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const newContent = readFileSync(staged, 'utf8');
  const action = existsSync(target) ? 'modify' : 'create';

  const oldLines = oldContent.split('\n').length;
  const newLines = newContent.split('\n').length;
  const delta = newLines - oldLines;

  const patch = createTwoFilesPatch(relPath, relPath + ' (staged)', oldContent, newContent);
  const patchLines = patch.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-'));
  const preview = patchLines.slice(0, PREVIEW_LINES).map((line) => {
    if (line.startsWith('+')) return chalk.hex('#4ADE80')(line);
    if (line.startsWith('-')) return chalk.hex('#F87171')(line);
    return chalk.dim(line);
  }).join('\n');
  const more =
    patchLines.length > PREVIEW_LINES
      ? frameDim(`\n  … +${patchLines.length - PREVIEW_LINES} diff lines (use /diff for full)`)
      : '';

  const deltaStr =
    delta === 0 ? '±0 lines' : delta > 0 ? `+${delta} lines` : `${delta} lines`;

  const actionColor = ACTION_COLORS[action] ?? chalk.dim;
  const actionBadge = actionColor(` ${action.toUpperCase()} `);

  return (
    frameDim('  staged ') +
    accent(relPath) +
    actionBadge +
    chalk.dim(` ${deltaStr}\n`) +
    (preview ? preview + more : chalk.dim('  (empty file)'))
  );
}

export function printInlineDiffForPath(projectRoot: string, relPath: string): void {
  const summary = summarizeStagedFileDiff(projectRoot, relPath);
  if (summary) console.log('\n' + summary + '\n');
}
