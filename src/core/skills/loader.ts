/**
 * Skill loader.
 *
 * Reads `<projectRoot>/.spark-cli/skills/<name>/SKILL.md`. Same minimal
 * frontmatter parser as the slash-command loader (kept independent so changes
 * to one don't ripple through the other).
 *
 * Frontmatter keys (all optional except `name` is recommended):
 *   name: tilemap
 *   description: Patterns for tilemaps
 *   triggers: [tilemap, tile map, TiledMap]
 *   triggerPattern: /tile.*map/i
 *   allowedTools: [read_file, write_file]
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Skill, SkillRegistry } from './registry.js';

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  triggerPattern?: string;
  allowedTools?: string[];
}

interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

export function parseSkillFile(raw: string): ParsedSkill {
  const lines = raw.split(/\r?\n/);
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
  if (fmEnd === -1) return { frontmatter: {}, body: raw.trim() };

  const fm: SkillFrontmatter = {};
  for (let j = fmStart; j < fmEnd; j++) {
    const line = lines[j]!;
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'name') fm.name = value;
    else if (key === 'description') fm.description = value;
    else if (key === 'triggers') fm.triggers = parseList(value);
    else if (key === 'triggerpattern') fm.triggerPattern = value;
    else if (key === 'allowedtools') fm.allowedTools = parseList(value);
  }
  const body = lines.slice(fmEnd + 1).join('\n').trim();
  return { frontmatter: fm, body };
}

function parseList(value: string): string[] {
  const stripped = value.replace(/^\[|\]$/g, '').trim();
  if (!stripped) return [];
  return stripped
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function skillsDir(projectRoot: string): string {
  return join(projectRoot, '.spark-cli', 'skills');
}

export function loadSkillsFromDisk(
  registry: SkillRegistry,
  projectRoot: string,
): void {
  const dir = skillsDir(projectRoot);
  if (!existsSync(dir)) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const skillRoot = join(dir, entry);
    let stat;
    try {
      stat = statSync(skillRoot);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const file = join(skillRoot, 'SKILL.md');
    if (!existsSync(file)) continue;
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseSkillFile(raw);
    const name = parsed.frontmatter.name ?? entry;
    if (!/^[a-z0-9][\w-]*$/i.test(name)) continue;

    let triggerPattern: RegExp | undefined;
    if (parsed.frontmatter.triggerPattern) {
      const m = parsed.frontmatter.triggerPattern.match(/^\/(.+)\/([gimsuy]*)$/);
      try {
        triggerPattern = m
          ? new RegExp(m[1]!, m[2])
          : new RegExp(parsed.frontmatter.triggerPattern, 'i');
      } catch {
        triggerPattern = undefined;
      }
    }

    const skill: Skill = {
      name,
      description: parsed.frontmatter.description,
      body: parsed.body,
      triggers: parsed.frontmatter.triggers ?? [],
      ...(triggerPattern ? { triggerPattern } : {}),
      ...(parsed.frontmatter.allowedTools
        ? { allowedTools: parsed.frontmatter.allowedTools }
        : {}),
    };
    registry.register(skill);
  }
}
