/**
 * Loader for file-based slash commands.
 *
 * Scans `.spark-cli/commands/*.md` (project) and `~/.spark-cli/commands/*.md`
 * (user). Project-local commands win on name collisions. Each markdown file
 * may declare YAML-ish frontmatter; the body becomes the synthetic user
 * prompt fed to the agent loop when the command is invoked.
 *
 * Frontmatter contract (all optional):
 *   ---
 *   description: short text shown in /help
 *   arguments: free-form template; $ARGUMENTS expands at dispatch time
 *   allowedTools: [read_file, grep]
 *   mode: plan | normal | auto
 *   ---
 *
 * The parser is intentionally minimal — we don't add a yaml dep just for this.
 * Lines outside `key: value` and `key: [a, b]` shapes are ignored.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import type { SlashCommand, SlashRegistry } from './registry.js';

interface ParsedFrontmatter {
  description?: string;
  arguments?: string;
  allowedTools?: string[];
  mode?: 'plan' | 'normal' | 'auto';
}

interface ParsedCommand {
  frontmatter: ParsedFrontmatter;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedCommand {
  const lines = raw.split(/\r?\n/);
  // Frontmatter is optional and starts with --- on the first non-empty line.
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (lines[i]?.trim() !== '---') {
    return { frontmatter: {}, body: raw.trim() };
  }
  const fmStart = i + 1;
  let fmEnd = -1;
  for (let j = fmStart; j < lines.length; j++) {
    if (lines[j]!.trim() === '---') {
      fmEnd = j;
      break;
    }
  }
  if (fmEnd === -1) {
    return { frontmatter: {}, body: raw.trim() };
  }

  const fm: ParsedFrontmatter = {};
  for (let j = fmStart; j < fmEnd; j++) {
    const line = lines[j]!;
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'description') fm.description = value;
    else if (key === 'arguments') fm.arguments = value;
    else if (key === 'allowedtools') {
      const arr = parseList(value);
      if (arr) fm.allowedTools = arr;
    } else if (key === 'mode') {
      if (value === 'plan' || value === 'normal' || value === 'auto') fm.mode = value;
    }
  }
  const body = lines.slice(fmEnd + 1).join('\n').trim();
  return { frontmatter: fm, body };
}

function parseList(value: string): string[] | undefined {
  // Accept `[a, b, c]` or `a, b, c`.
  const stripped = value.replace(/^\[|\]$/g, '').trim();
  if (!stripped) return [];
  return stripped
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function commandsDirProject(projectRoot: string): string {
  return join(projectRoot, '.spark-cli', 'commands');
}

function commandsDirUser(): string {
  return join(homedir(), '.spark-cli', 'commands');
}

function readMdFiles(dir: string): Array<{ name: string; path: string }> {
  if (!existsSync(dir)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Array<{ name: string; path: string }> = [];
  for (const e of entries) {
    if (extname(e).toLowerCase() !== '.md') continue;
    const name = basename(e, extname(e)).toLowerCase();
    if (!/^[a-z0-9][\w-]*$/.test(name)) continue;
    out.push({ name, path: join(dir, e) });
  }
  return out;
}

function fileToCommand(
  name: string,
  filePath: string,
  source: 'project' | 'user',
): SlashCommand | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseFrontmatter(raw);
  return {
    name,
    description: parsed.frontmatter.description ?? `(custom: ${filePath})`,
    usage: parsed.frontmatter.arguments,
    source,
    body: parsed.body,
    allowedTools: parsed.frontmatter.allowedTools,
    mode: parsed.frontmatter.mode,
  };
}

/**
 * Load file-based slash commands into an existing registry. Project commands
 * are loaded last so they override user commands; built-ins stay frozen
 * because they were registered with handlers before this is called.
 *
 * Built-in handlers always win — file-based commands cannot replace them.
 */
export function loadFileCommands(
  registry: SlashRegistry,
  projectRoot: string,
): void {
  // User scope first; project scope overrides if names match.
  for (const f of readMdFiles(commandsDirUser())) {
    if (registry.get(f.name)?.source === 'builtin') continue;
    const cmd = fileToCommand(f.name, f.path, 'user');
    if (cmd) registry.register(cmd);
  }
  for (const f of readMdFiles(commandsDirProject(projectRoot))) {
    if (registry.get(f.name)?.source === 'builtin') continue;
    const cmd = fileToCommand(f.name, f.path, 'project');
    if (cmd) registry.register(cmd);
  }
}

/** Exposed for tests. */
export const _internals = {
  commandsDirProject,
  commandsDirUser,
};
