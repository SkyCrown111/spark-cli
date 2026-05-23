/**
 * SparkCLI REPL accent palette.
 */

import chalk from 'chalk';

export const ACCENT = '#F472B6';
export const ACCENT_BRIGHT = '#F9A8D4';
export const ACCENT_DEEP = '#EC4899';
export const FRAME = '#BE185D';
export const FRAME_DIM = '#6B7280';

export const accent = (s: string): string => chalk.hex(ACCENT)(s);
export const accentBright = (s: string): string => chalk.hex(ACCENT_BRIGHT)(s);
export const accentBold = (s: string): string => chalk.hex(ACCENT).bold(s);
export const frame = (s: string): string => chalk.hex(FRAME)(s);
export const frameDim = (s: string): string => chalk.hex(FRAME_DIM)(s);
