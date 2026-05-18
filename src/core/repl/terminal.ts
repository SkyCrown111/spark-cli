/** Terminal width + ANSI helpers for REPL chrome. */

export function terminalWidth(columns = process.stdout.columns): number {
  const w = columns ?? 80;
  return Math.max(w, 52);
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function displayWidth(s: string): number {
  let width = 0;
  for (const ch of stripAnsi(s)) width += charWidth(ch);
  return width;
}

function charWidth(ch: string): number {
  const cp = ch.codePointAt(0);
  if (cp == null) return 0;
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (isCombiningCodePoint(cp)) return 0;
  return isFullWidthCodePoint(cp) ? 2 : 1;
}

function isCombiningCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  );
}

function isFullWidthCodePoint(cp: number): boolean {
  return (
    cp >= 0x1100 &&
    (
      cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x3247 && cp !== 0x303f) ||
      (cp >= 0x3250 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0xa4c6) ||
      (cp >= 0xa960 && cp <= 0xa97c) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6b) ||
      (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    )
  );
}

export interface FrameChars {
  horizontal: string;
  vertical: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  assistantBranch: string;
  ellipsis: string;
  middleDot: string;
}

const UNICODE_FRAME: FrameChars = {
  horizontal: '─',
  vertical: '│',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  assistantBranch: '└',
  ellipsis: '…',
  middleDot: '·',
};

const ASCII_FRAME: FrameChars = {
  horizontal: '-',
  vertical: '|',
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  assistantBranch: '\\',
  ellipsis: '...',
  middleDot: '*',
};

export function supportsUnicodeUi(): boolean {
  if (process.platform !== 'win32') return true;
  if (process.env.WT_SESSION) return true;
  const termProgram = (process.env.TERM_PROGRAM ?? '').toLowerCase();
  return termProgram === 'vscode' || termProgram === 'windows_terminal';
}

export function frameChars(): FrameChars {
  return supportsUnicodeUi() ? UNICODE_FRAME : ASCII_FRAME;
}
