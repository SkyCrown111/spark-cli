/**
 * Skill loader.
 *
 * Sources (lowest → highest precedence; later overrides same `name`):
 * 1. Bundled `skills/` next to the CLI (copied to `dist/skills/` at build)
 * 2. `~/.spark-cli/skills/`
 * 3. `<projectRoot>/.spark-cli/skills/`
 *
 * Same minimal frontmatter parser as the slash-command loader (kept
 * independent so changes to one don't ripple through the other).
 *
 * Frontmatter keys (all optional except `name` is recommended):
 *   name: tilemap
 *   description: Patterns for tilemaps
 *   triggers: [tilemap, tile map, TiledMap]
 *   triggerPattern: /tile.*map/i
 *   allowedTools: [read_file, write_file]
 *   disableModelInvocation: true  (model cannot load this skill)
 *   userInvocable: false  (only model can load, not /skill command)
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Skill, SkillRegistry } from './registry.js';
import { getGlobalSkillsDir } from '../../config/paths.js';
import { getBuiltinSkillsDir } from './builtin-dir.js';

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  triggerPattern?: string;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
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
    else if (key === 'disablemodelinvocation') fm.disableModelInvocation = parseBool(value);
    else if (key === 'userinvocable') fm.userInvocable = parseBool(value);
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

function parseBool(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/** Try to compile `triggerPattern` from frontmatter; returns undefined on failure. */
export function compileSkillTriggerPattern(raw: string | undefined): RegExp | undefined {
  if (!raw?.trim()) return undefined;
  const m = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  try {
    return m ? new RegExp(m[1]!, m[2]) : new RegExp(raw, 'i');
  } catch {
    return undefined;
  }
}

function projectSkillsDir(projectRoot: string): string {
  return join(projectRoot, '.spark-cli', 'skills');
}

export type SkillSourceLayer = 'bundled' | 'global' | 'project';

export interface SkillSourceRoot {
  layer: SkillSourceLayer;
  dir: string;
}

/**
 * Ordered skill roots (bundled → global → project). Missing dirs omitted.
 */
export function listSkillSourceRoots(projectRoot: string): SkillSourceRoot[] {
  const out: SkillSourceRoot[] = [];
  const bundled = getBuiltinSkillsDir();
  if (bundled) out.push({ layer: 'bundled', dir: bundled });
  const globalDir = getGlobalSkillsDir();
  if (existsSync(globalDir)) out.push({ layer: 'global', dir: globalDir });
  const proj = projectSkillsDir(projectRoot);
  if (existsSync(proj)) out.push({ layer: 'project', dir: proj });
  return out;
}

/**
 * Load every `<parent>/…/SKILL.md` into the registry (later calls overwrite
 * same skill name).
 */
export function loadSkillsFromParentDir(registry: SkillRegistry, parentDir: string): void {
  if (!existsSync(parentDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(parentDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const skillRoot = join(parentDir, entry);
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

    const triggerPattern = compileSkillTriggerPattern(parsed.frontmatter.triggerPattern);

    const skill: Skill = {
      name,
      description: parsed.frontmatter.description,
      body: parsed.body,
      triggers: parsed.frontmatter.triggers ?? [],
      ...(triggerPattern ? { triggerPattern } : {}),
      ...(parsed.frontmatter.allowedTools
        ? { allowedTools: parsed.frontmatter.allowedTools }
        : {}),
      ...(parsed.frontmatter.disableModelInvocation !== undefined
        ? { disableModelInvocation: parsed.frontmatter.disableModelInvocation }
        : {}),
      ...(parsed.frontmatter.userInvocable !== undefined
        ? { userInvocable: parsed.frontmatter.userInvocable }
        : {}),
    };
    registry.register(skill);
  }
}

/**
 * Load skills from bundled dir, then `~/.spark-cli/skills/`, then project
 * `.spark-cli/skills/` (project wins on duplicate names).
 */
export function loadSkillsFromDisk(registry: SkillRegistry, projectRoot: string): void {
  for (const { dir } of listSkillSourceRoots(projectRoot)) {
    loadSkillsFromParentDir(registry, dir);
  }
}
