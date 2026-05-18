/**
 * Spark — SparkCLI's gamepad mascot (orange, Claude Code–inspired).
 */

import chalk from 'chalk';
import { accent, accentBold, accentBright } from './theme.js';

export const MASCOT_NAME = 'Spark';

/** Gamepad ASCII shown in the welcome card (left column). */
export const SPARK_GAMEPAD_LINES = [
  ' ╭──╮ ╭──╮ ',
  '╭╯▓▓││▓▓╰╮',
  '│   ═══   │',
  '╰───┬─┬───╯',
  '    └ └    ',
] as const;

const GREETINGS = [
  'Ready when you are.',
  'What are we building today?',
  'Your staging lane is open.',
  '@files and /commands welcome.',
] as const;

const FAREWELLS = [
  'Save often — see you in the next playtest.',
  'Spark will be here when you return.',
  'Good luck on the build!',
] as const;

export function isMascotDisabled(): boolean {
  const v = process.env.SPARK_CLI_NO_MASCOT?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function pickGemiGreeting(seed?: number): string {
  return pickSparkGreeting(seed);
}

export function pickSparkGreeting(seed?: number): string {
  const i =
    seed !== undefined
      ? Math.abs(seed) % GREETINGS.length
      : Math.floor(Math.random() * GREETINGS.length);
  return GREETINGS[i]!;
}

export function pickGemiFarewell(seed?: number): string {
  return pickSparkFarewell(seed);
}

export function pickSparkFarewell(seed?: number): string {
  const i =
    seed !== undefined
      ? Math.abs(seed) % FAREWELLS.length
      : Math.floor(Math.random() * FAREWELLS.length);
  return FAREWELLS[i]!;
}

function colorGamepadChar(ch: string): string {
  if ('█▀╯╰'.includes(ch)) return accentBold(ch);
  if ('▄▓╭╮│┬┘└─'.includes(ch)) return accent(ch);
  if ('═'.includes(ch)) return accentBright(ch);
  return ch;
}

/** Orange gamepad art for the welcome card. */
export function renderSparkPixel(): string[] {
  return SPARK_GAMEPAD_LINES.map((line) => {
    let out = '';
    for (const ch of line) out += colorGamepadChar(ch);
    return out;
  });
}

export function renderGemiArt(_variant: 'idle' | 'wave' = 'idle'): string {
  return renderSparkPixel().join('\n');
}

export function renderGemiTagline(greeting: string): string {
  return accentBold(MASCOT_NAME) + chalk.dim(' · ') + chalk.dim(greeting);
}

export function renderGemiFarewellLine(message: string): string {
  return chalk.dim('  ') + accentBold(MASCOT_NAME) + chalk.dim(` — ${message}`);
}
