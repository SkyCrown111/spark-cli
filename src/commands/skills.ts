/**
 * `spark-cli skills` — list, validate, or scaffold project skills.
 */

import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMergedConfig } from '../config/load.js';
import { getProjectSparkDir } from '../config/paths.js';
import { createSkillRegistry } from '../core/skills/registry.js';
import { loadSkillsFromDisk } from '../core/skills/loader.js';
import { validateSkills } from '../core/skills/validate.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

function projectSkillsDir(root: string): string {
  return join(getProjectSparkDir(root), 'skills');
}

export async function runSkillsList(globals: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(globals);
  const reg = createSkillRegistry();
  loadSkillsFromDisk(reg, root);
  const skills = reg.list();
  if (globals.json) {
    printJson({
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description ?? null,
        triggers: s.triggers,
        allowedTools: s.allowedTools ?? [],
      })),
    });
    return;
  }
  if (skills.length === 0) {
    logger.info(chalk.dim('No skills loaded (bundled, ~/.spark/skills/, or .spark/skills/).'));
    logger.info(chalk.dim('  Run: spark-cli skills init <name>'));
    return;
  }
  const max = Math.max(...skills.map((s) => s.name.length));
  for (const s of skills) {
    const desc = s.description ? ` — ${s.description}` : '';
    logger.info(`  ${chalk.cyan(s.name.padEnd(max))}${desc}`);
    if (s.triggers.length > 0) {
      logger.info(chalk.dim(`    triggers: ${s.triggers.join(', ')}`));
    }
    if (s.allowedTools && s.allowedTools.length > 0) {
      logger.info(chalk.dim(`    allowedTools: ${s.allowedTools.join(', ')}`));
    }
  }
}

export async function runSkillsValidate(globals: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(globals);
  let config;
  try {
    config = await loadMergedConfig(root);
  } catch {
    config = undefined;
  }
  const report = validateSkills(root, config);
  if (globals.json) {
    printJson({
      ok: report.errors.length === 0,
      errors: report.errors,
      warnings: report.warnings,
      definitions: report.definitions,
    });
    return report.errors.length === 0 ? 0 : 2;
  }
  if (report.errors.length === 0 && report.warnings.length === 0) {
    logger.info(chalk.green('✓'), `Skills OK (${report.definitions.length} definition(s)).`);
    return 0;
  }
  for (const e of report.errors) {
    logger.info(chalk.red('✗'), e);
  }
  for (const w of report.warnings) {
    logger.info(chalk.yellow('!'), w);
  }
  return report.errors.length === 0 ? 0 : 2;
}

const SKILL_TEMPLATE = `---
name: {name}
description: One-line summary for the skills index
triggers: [keyword1, keyword2]
# triggerPattern: /foo.*bar/i
allowedTools: [read_file, glob, grep]
---

## Overview

Replace this with step-by-step guidance for the agent.

## Tools

Mention which built-in or MCP tools to prefer and any config flags (e.g. \`mcp.allowWrite\`).
`;

export async function runSkillsInit(
  globals: GlobalOptions,
  opts: { name: string; force?: boolean },
): Promise<void> {
  const root = resolveProjectRoot(globals);
  const raw = opts.name.trim();
  if (!/^[a-z0-9][\w-]*$/i.test(raw)) {
    throw new Error('skill name must match /^[a-z0-9][\\w-]*$/i (use letters, numbers, hyphen)');
  }
  const dir = join(projectSkillsDir(root), raw);
  const file = join(dir, 'SKILL.md');
  if (existsSync(file) && !opts.force) {
    throw new Error(`Skill already exists: ${file} (pass --force to overwrite)`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, SKILL_TEMPLATE.replaceAll('{name}', raw), 'utf8');
  if (!globals.json) {
    logger.info(chalk.green('✓'), `Created ${file}`);
    logger.info(chalk.dim('  Edit triggers and body, then run: spark-cli skills validate'));
  } else {
    printJson({ created: file });
  }
}
