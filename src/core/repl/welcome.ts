/**
 * Shared welcome card for both readline and Ink REPL entry.
 */

import chalk from 'chalk';
import { accent, accentBold, frameDim } from './theme.js';
import { isMascotDisabled, renderSparkPixel } from './mascot.js';
import { displayWidth, frameChars, terminalWidth } from './terminal.js';

export interface WelcomeSessionInfo {
  projectRoot: string;
  engine: string;
  modelLine: string;
  writeModeLabel: string;
  version?: string;
}

export interface RenderWelcomeOptions {
  info: WelcomeSessionInfo;
  showMascot?: boolean;
}

function padVisible(text: string, width: number): string {
  const vis = displayWidth(text);
  if (vis >= width) return text;
  return text + ' '.repeat(width - vis);
}

function frameRow(text: string, width: number): string {
  const chars = frameChars();
  return frameDim(`${chars.vertical} `) + padVisible(text, width) + frameDim(` ${chars.vertical}`);
}

function frameSplitRow(left: string, right: string, leftWidth: number, rightWidth: number): string {
  const chars = frameChars();
  return (
    frameDim(`${chars.vertical} `) +
    padVisible(left, leftWidth) +
    frameDim(` ${chars.vertical} `) +
    padVisible(right, rightWidth) +
    frameDim(` ${chars.vertical}`)
  );
}

function shortPath(p: string, max = 28): string {
  if (p.length <= max) return p;
  return frameChars().ellipsis + p.slice(-(max - 1));
}

function topBorderTitle(totalInner: number, title: string): string {
  const chars = frameChars();
  const titleText = ` ${title} `;
  const used = displayWidth(titleText);
  const remaining = Math.max(0, totalInner + 2 - used);
  const left = chars.horizontal.repeat(2);
  const right = chars.horizontal.repeat(Math.max(0, remaining - 2));
  return frameDim(chars.topLeft + left) + accentBold(titleText) + frameDim(right + chars.topRight);
}

function engineLabel(engine: string): string {
  return engine === 'unknown' ? 'unknown' : engine;
}

export function renderReplWelcome(opts: RenderWelcomeOptions): string {
  const { info, showMascot = !isMascotDisabled() } = opts;
  const inner = Math.max(44, terminalWidth() - 4);
  const dot = frameChars().middleDot;
  const modeLabel = info.writeModeLabel.includes('direct') ? 'accept edits on' : 'staging';
  const path = shortPath(info.projectRoot, 44);
  const tips =
    chalk.white('Use ') +
    accent('/help') +
    chalk.white(', ') +
    accent('@file') +
    chalk.white(', ') +
    accent('Shift+Tab') +
    chalk.white(' to get moving');

  const lines: string[] = [''];
  lines.push(topBorderTitle(inner, versionLabel(info.version)));
  const chars = frameChars();
  const useSplitLayout = showMascot && inner >= 72;

  if (!useSplitLayout) {
    lines.push(frameRow(accentBold('Welcome back!'), inner));
    lines.push(frameRow(tips, inner));
    lines.push(
      frameRow(
        chalk.white(engineLabel(info.engine)) +
          chalk.dim(` ${dot} `) +
          chalk.dim(path) +
          chalk.dim(` ${dot} `) +
          chalk.dim(modeLabel),
        inner,
      ),
    );
    if (info.modelLine) {
      lines.push(
        frameRow(chalk.dim(modeLabel) + chalk.dim(` ${dot} `) + chalk.dim(info.modelLine), inner),
      );
    }
  } else {
    const mascotLines = renderSparkPixel();
    const leftWidth = Math.max(20, Math.min(30, Math.floor(inner * 0.26)));
    const rightWidth = Math.max(20, inner - leftWidth - 3);
    const rightLines = [
      accentBold('Welcome back!'),
      tips,
      chalk.white(engineLabel(info.engine)) + chalk.dim(` ${dot} `) + chalk.dim(path),
      info.modelLine
        ? chalk.dim(modeLabel) + chalk.dim(` ${dot} `) + chalk.dim(info.modelLine)
        : chalk.dim(modeLabel),
    ];
    const rowCount = Math.max(mascotLines.length, rightLines.length);
    for (let i = 0; i < rowCount; i++) {
      lines.push(frameSplitRow(mascotLines[i] ?? '', rightLines[i] ?? '', leftWidth, rightWidth));
    }
  }

  lines.push(frameDim(chars.bottomLeft + chars.horizontal.repeat(inner + 2) + chars.bottomRight));
  return lines.join('\n');
}

function versionLabel(version: string | undefined): string {
  return version ? `SparkCLI v${version}` : 'SparkCLI';
}
