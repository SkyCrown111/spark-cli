/**
 * Agent definition loader.
 *
 * Sources (lowest → highest precedence; later overrides same `name`):
 * 1. `~/.spark/agents/`
 * 2. `<projectRoot>/.spark/agents/`
 *
 * Each agent is a folder containing `AGENT.md` with YAML-ish frontmatter:
 *   name: code-reviewer
 *   description: Focused code review agent
 *   allowedTools: [read_file, glob, grep]
 *   contextMode: fresh
 *
 * The markdown body becomes the system prompt extension for that agent.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentDefinition, AgentRegistry, AgentContextMode } from './registry.js';
import { getGlobalConfigDir, getLegacyGlobalConfigDir } from '../../config/paths.js';

interface AgentFrontmatter {
  name?: string;
  description?: string;
  allowedTools?: string[];
  contextMode?: AgentContextMode;
}

interface ParsedAgent {
  frontmatter: AgentFrontmatter;
  body: string;
}

export function parseAgentFile(raw: string): ParsedAgent {
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

  const fm: AgentFrontmatter = {};
  for (let j = fmStart; j < fmEnd; j++) {
    const line = lines[j]!;
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'name') fm.name = value;
    else if (key === 'description') fm.description = value;
    else if (key === 'allowedtools') fm.allowedTools = parseList(value);
    else if (key === 'contextmode') {
      const lower = value.toLowerCase();
      if (lower === 'inherit' || lower === 'fresh' || lower === 'fork') {
        fm.contextMode = lower;
      }
    }
  }
  const body = lines
    .slice(fmEnd + 1)
    .join('\n')
    .trim();
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

function globalAgentsDir(): string {
  return existsSync(join(getGlobalConfigDir(), 'agents'))
    ? join(getGlobalConfigDir(), 'agents')
    : join(getLegacyGlobalConfigDir(), 'agents');
}

function projectAgentsDir(projectRoot: string): string {
  return existsSync(join(projectRoot, '.spark', 'agents'))
    ? join(projectRoot, '.spark', 'agents')
    : join(projectRoot, '.spark-cli', 'agents');
}

/**
 * Load every `<parent>/AGENT.md` into the registry. Later calls overwrite
 * the same agent name.
 */
export function loadAgentsFromParentDir(
  registry: AgentRegistry,
  parentDir: string,
  source: 'global' | 'project',
): void {
  if (!existsSync(parentDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(parentDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const agentRoot = join(parentDir, entry);
    let stat;
    try {
      stat = statSync(agentRoot);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const file = join(agentRoot, 'AGENT.md');
    if (!existsSync(file)) continue;
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseAgentFile(raw);
    const name = parsed.frontmatter.name ?? entry;
    if (!/^[a-z0-9][\w-]*$/i.test(name)) continue;

    const agent: AgentDefinition = {
      name,
      systemPrompt: parsed.body,
      source,
      ...(parsed.frontmatter.description ? { description: parsed.frontmatter.description } : {}),
      ...(parsed.frontmatter.allowedTools ? { allowedTools: parsed.frontmatter.allowedTools } : {}),
      ...(parsed.frontmatter.contextMode ? { contextMode: parsed.frontmatter.contextMode } : {}),
    };
    registry.register(agent);
  }
}

/**
 * Load agents from `~/.spark/agents/`, then project `.spark/agents/`
 * (project wins on duplicate names).
 */
export function loadAgentsFromDisk(registry: AgentRegistry, projectRoot: string): void {
  loadAgentsFromParentDir(registry, globalAgentsDir(), 'global');
  loadAgentsFromParentDir(registry, projectAgentsDir(projectRoot), 'project');
}
