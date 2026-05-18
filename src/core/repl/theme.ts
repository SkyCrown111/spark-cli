/**
 * SparkCLI REPL accent palette (Claude Code–inspired warm orange).
 */

import chalk from 'chalk';

/** Primary accent — replaces legacy pink/magenta. */
export const ACCENT = '#FB923C';
export const ACCENT_BRIGHT = '#FDBA74';
export const ACCENT_DEEP = '#EA580C';
export const FRAME = '#9A3412';
export const FRAME_DIM = '#4B5563';

export const accent = (s: string): string => chalk.hex(ACCENT)(s);
export const accentBright = (s: string): string => chalk.hex(ACCENT_BRIGHT)(s);
export const accentBold = (s: string): string => chalk.hex(ACCENT).bold(s);
export const frame = (s: string): string => chalk.hex(FRAME)(s);
export const frameDim = (s: string): string => chalk.hex(FRAME_DIM)(s);
