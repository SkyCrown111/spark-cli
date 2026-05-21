/**
 * Agent definition loader.
 *
 * Reads agent definitions from `.spark-cli/agents/<name>.md` files with YAML
 * frontmatter. Each definition specifies the agent's name, model, allowed tools,
 * and whether it runs in the background.
 *
 * Example `.spark-cli/agents/code-reviewer.md`:
 * ```yaml
 * ---
 * name: code-reviewer
 * model: openai/gpt-4o
 * tools: [read_file, glob, grep]
 * bg: true
 * ---
 * You are a code reviewer. Analyze the project for issues...
 * ```
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';

// ── Types ──────────────────────────────────────────────────────

export interface AgentDefinition {
  /** Unique agent name (from frontmatter or filename). */
  name: string;
  /** Model override (e.g. "openai/gpt-4o"). */
  model?: string;
  /** Tool allow-list. If undefined, all tools are allowed. */
  tools?: string[];
  /** Whether this agent runs as a background process. */
  bg: boolean;
  /** System prompt body (markdown after frontmatter). */
  prompt: string;
  /** Source file path (for diagnostics). */
  sourcePath: string;
}

// ── YAML frontmatter parser ───────────────────────────────────

/**
 * Minimal YAML frontmatter parser — handles simple `key: value` and
 * `key: [a, b, c]` patterns. Does not support nested objects.
 */
function parseFrontmatter(
  text: string,
): { meta: Record<string, unknown>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: text };
  }
  const [, yamlBlock, body] = match;
  const meta: Record<string, unknown> = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Handle arrays: [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    // Handle booleans
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    // Strip quotes from strings
    else if (typeof value === 'string') {
      value = value.replace(/^["']|["']$/g, '');
    }

    meta[key] = value;
  }

  return { meta, body: body.trim() };
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Load a single agent definition from a `.md` file.
 */
export function loadAgentDefinition(filePath: string): AgentDefinition | null {
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const fileName = basename(filePath, '.md');

  const name = (meta.name as string) ?? fileName;
  const model = (meta.model as string) || undefined;
  const tools = Array.isArray(meta.tools) ? (meta.tools as string[]) : undefined;
  const bg = meta.bg === true;

  return {
    name,
    model,
    tools,
    bg,
    prompt: body || `You are the ${name} agent.`,
    sourcePath: filePath,
  };
}

/**
 * Load all agent definitions from `.spark-cli/agents/*.md`.
 */
export function loadAllAgentDefinitions(projectRoot: string): AgentDefinition[] {
  const agentsDir = join(getProjectSparkDir(projectRoot), 'agents');
  if (!existsSync(agentsDir)) return [];

  const defs: AgentDefinition[] = [];
  for (const entry of readdirSync(agentsDir)) {
    if (!entry.endsWith('.md')) continue;
    const def = loadAgentDefinition(join(agentsDir, entry));
    if (def) defs.push(def);
  }
  return defs;
}

/**
 * Find a specific agent definition by name.
 */
export function findAgentDefinition(
  projectRoot: string,
  name: string,
): AgentDefinition | null {
  // Direct file match
  const directPath = join(getProjectSparkDir(projectRoot), 'agents', `${name}.md`);
  const direct = loadAgentDefinition(directPath);
  if (direct) return direct;

  // Search by frontmatter name
  const all = loadAllAgentDefinitions(projectRoot);
  return all.find((d) => d.name === name) ?? null;
}
