/**
 * Validate skill installations (frontmatter, shadowing, unknown tools).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SparkCLIConfig } from '../../config/schema.js';
import { DEFAULT_CONFIG } from '../../config/schema.js';
import { buildDefaultRegistry } from '../agent/tools/index.js';
import {
  compileSkillTriggerPattern,
  listSkillSourceRoots,
  parseSkillFile,
  type SkillSourceLayer,
} from './loader.js';

export interface SkillDefinitionSite {
  name: string;
  layer: SkillSourceLayer;
  path: string;
  folder: string;
}

export interface SkillValidationReport {
  definitions: SkillDefinitionSite[];
  /** Same skill name defined in more than one layer (lower layers shadowed). */
  shadowWarnings: string[];
  errors: string[];
  warnings: string[];
}

const MAX_BODY_WARN = 96 * 1024;
const NAME_RE = /^[a-z0-9][\w-]*$/i;

interface SkillFileRef {
  path: string;
  layer: SkillSourceLayer;
  folder: string;
}

function listAllSkillFiles(projectRoot: string): SkillFileRef[] {
  const out: SkillFileRef[] = [];
  for (const { layer, dir } of listSkillSourceRoots(projectRoot)) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const skillRoot = join(dir, entry);
      let st;
      try {
        st = statSync(skillRoot);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      const file = join(skillRoot, 'SKILL.md');
      if (!existsSync(file)) continue;
      out.push({ path: file, layer, folder: entry });
    }
  }
  return out;
}

function shadowMessages(sites: SkillDefinitionSite[]): string[] {
  const layerOrder: SkillSourceLayer[] = ['bundled', 'global', 'project'];
  const rank = (l: SkillSourceLayer) => layerOrder.indexOf(l);
  const byName = new Map<string, SkillDefinitionSite[]>();
  for (const s of sites) {
    const k = s.name.toLowerCase();
    const arr = byName.get(k) ?? [];
    arr.push(s);
    byName.set(k, arr);
  }
  const out: string[] = [];
  for (const [, arr] of byName) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => rank(a.layer) - rank(b.layer));
    const winner = sorted[sorted.length - 1]!;
    for (const s of sorted.slice(0, -1)) {
      out.push(
        `Skill "${s.name}": ${s.layer} (${s.path}) is shadowed by ${winner.layer} (${winner.path}).`,
      );
    }
  }
  return out;
}

/**
 * @param config optional merged config for accurate MCP tool names in registry
 */
export function validateSkills(
  projectRoot: string,
  config?: SparkCLIConfig,
): SkillValidationReport {
  const files = listAllSkillFiles(projectRoot);
  const definitions: SkillDefinitionSite[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const ref of files) {
    let raw: string;
    try {
      raw = readFileSync(ref.path, 'utf8');
    } catch (e) {
      errors.push(`${ref.path}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const parsed = parseSkillFile(raw);
    const name = parsed.frontmatter.name ?? ref.folder;
    if (!NAME_RE.test(name)) {
      errors.push(
        `${ref.path}: invalid skill name "${name}" (use letters, numbers, hyphen; must match /^[a-z0-9][\\w-]*$/i).`,
      );
      continue;
    }
    definitions.push({
      name,
      layer: ref.layer,
      path: ref.path,
      folder: ref.folder,
    });
  }

  const shadowWarnings = shadowMessages(definitions);
  warnings.push(...shadowWarnings);

  const cfg = config ?? DEFAULT_CONFIG;
  let validToolNames: Set<string>;
  try {
    const reg = buildDefaultRegistry({ projectRoot, config: cfg, includeMcp: true });
    validToolNames = new Set(reg.list({ mode: 'normal' }).map((t) => t.function.name));
  } catch {
    validToolNames = new Set();
  }

  for (const site of definitions) {
    let raw: string;
    try {
      raw = readFileSync(site.path, 'utf8');
    } catch (e) {
      errors.push(`${site.path}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const parsed = parseSkillFile(raw);
    const tp = parsed.frontmatter.triggerPattern?.trim();
    if (tp && !compileSkillTriggerPattern(tp)) {
      errors.push(`${site.path}: invalid triggerPattern: ${tp}`);
    }
    if (Buffer.byteLength(parsed.body, 'utf8') > MAX_BODY_WARN) {
      warnings.push(
        `${site.path}: skill body is very large (${Math.round(Buffer.byteLength(parsed.body, 'utf8') / 1024)} KB); consider splitting.`,
      );
    }
    const tools = parsed.frontmatter.allowedTools;
    if (tools?.length) {
      for (const t of tools) {
        if (!validToolNames.has(t)) {
          warnings.push(`${site.path}: allowedTools mentions unknown tool "${t}".`);
        }
      }
    }
  }

  return { definitions, shadowWarnings, errors, warnings };
}
