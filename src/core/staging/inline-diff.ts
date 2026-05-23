import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';
import { getStagingDir } from '../../config/paths.js';
import { accent, frameDim } from '../repl/theme.js';
import { loadManifest } from './patch-manager.js';

const PREVIEW_LINES = 8;

const ACTION_COLORS: Record<string, (s: string) => string> = {
  create: chalk.hex('#4ADE80'),
  modify: chalk.hex('#FBBF24'),
  delete: chalk.hex('#F87171'),
};

function summarizeDelete(relPath: string, oldContent: string): string {
  const patch = createTwoFilesPatch(relPath, relPath + ' (deleted)', oldContent, '');
  const patchLines = patch.split('\n').filter((line) => line.startsWith('-'));
  const preview = patchLines
    .slice(0, PREVIEW_LINES)
    .map((line) => chalk.hex('#F87171')(line))
    .join('\n');
  const more =
    patchLines.length > PREVIEW_LINES
      ? frameDim(`\n  ... +${patchLines.length - PREVIEW_LINES} diff lines (use /diff for full)`)
      : '';
  return (
    frameDim('  staged ') +
    accent(relPath) +
    ACTION_COLORS.delete(' DELETE ') +
    chalk.dim(` -remove ${oldContent.split('\n').length} lines\n`) +
    (preview ? preview + more : chalk.dim('  (file removed)'))
  );
}

export function summarizeStagedFileDiff(projectRoot: string, relPath: string): string | null {
  const manifest = loadManifest(projectRoot);
  const entry = manifest.files.find((file) => file.path === relPath);
  if (!entry) return null;

  const staged = join(getStagingDir(projectRoot), 'files', relPath);
  const target = join(projectRoot, relPath);
  const actionColor = ACTION_COLORS[entry.action] ?? chalk.dim;

  if (entry.action === 'delete') {
    if (entry.kind === 'binary') {
      return (
        frameDim('  staged ') +
        accent(relPath) +
        actionColor(' DELETE ') +
        chalk.dim(` -remove ${entry.sizeBytes ?? 0} bytes\n`) +
        chalk.hex('#F87171')('  binary file removed')
      );
    }
    const oldContent = existsSync(target) ? readFileSync(target, 'utf8') : '';
    return summarizeDelete(relPath, oldContent);
  }

  if (!existsSync(staged)) return null;

  if (entry.kind === 'binary') {
    return (
      frameDim('  staged ') +
      accent(relPath) +
      actionColor(` ${entry.action.toUpperCase()} `) +
      chalk.dim(` ${entry.sizeBytes ?? 0} bytes\n`) +
      chalk.dim('  binary file staged')
    );
  }

  const oldContent = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const newContent = readFileSync(staged, 'utf8');
  const oldLines = oldContent.split('\n').length;
  const newLines = newContent.split('\n').length;
  const delta = newLines - oldLines;

  const patch = createTwoFilesPatch(relPath, relPath + ' (staged)', oldContent, newContent);
  const patchLines = patch
    .split('\n')
    .filter((line) => line.startsWith('+') || line.startsWith('-'));
  const preview = patchLines
    .slice(0, PREVIEW_LINES)
    .map((line) => {
      if (line.startsWith('+')) return chalk.hex('#4ADE80')(line);
      if (line.startsWith('-')) return chalk.hex('#F87171')(line);
      return chalk.dim(line);
    })
    .join('\n');
  const more =
    patchLines.length > PREVIEW_LINES
      ? frameDim(`\n  ... +${patchLines.length - PREVIEW_LINES} diff lines (use /diff for full)`)
      : '';
  const deltaStr = delta === 0 ? '+/-0 lines' : delta > 0 ? `+${delta} lines` : `${delta} lines`;

  return (
    frameDim('  staged ') +
    accent(relPath) +
    actionColor(` ${entry.action.toUpperCase()} `) +
    chalk.dim(` ${deltaStr}\n`) +
    (preview ? preview + more : chalk.dim('  (empty file)'))
  );
}

export function printInlineDiffForPath(projectRoot: string, relPath: string): void {
  const summary = summarizeStagedFileDiff(projectRoot, relPath);
  if (summary) console.log('\n' + summary + '\n');
}
