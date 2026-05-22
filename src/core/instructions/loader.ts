/**
 * Project instructions loader — auto-loads SPARKCLI.md files.
 *
 * Equivalent to Claude Code's CLAUDE.md system. Loads instructions from
 * multiple scopes (user → project → local → rules) and injects them
 * into the system prompt.
 *
 * Scopes (in order, later scopes can override earlier):
 *   1. ~/.spark-cli/SPARKCLI.md          — user-level (all projects)
 *   2. <project>/SPARKCLI.md             — project-level (team-shared)
 *   3. <project>/SPARKCLI.local.md       — local-level (personal, gitignored)
 *   4. <project>/.spark-cli/rules/*.md   — path-scoped rules
 *
 * Features:
 *   - @path/to/import syntax to import other files
 *   - HTML comments stripped before injection
 *   - Rules can be path-scoped via frontmatter `paths` field
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getGlobalConfigDir } from '../../config/paths.js';

const MAX_IMPORT_DEPTH = 5;
const MAX_INSTRUCTION_BYTES = 128 * 1024; // 128KB cap

interface RuleFile {
  /** Absolute path to the rule file */
  path: string;
  /** File content (after processing) */
  content: string;
  /** Path patterns this rule applies to (from frontmatter `paths` field) */
  paths: string[];
}

/**
 * Strip HTML comments from text.
 * <!-- comment --> is removed entirely.
 */
function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Process @path/to/import directives.
 * Resolves relative to the file's directory, reads the file,
 * and inlines its content. Supports nested imports up to MAX_IMPORT_DEPTH.
 */
function processImports(text: string, baseDir: string, depth: number): string {
  if (depth >= MAX_IMPORT_DEPTH) return text;

  return text.replace(
    /^@([\w./\\-]+)\s*$/gm,
    (_match, importPath: string) => {
      const absPath = resolve(baseDir, importPath);
      if (!existsSync(absPath)) {
        return `<!-- import not found: ${importPath} -->`;
      }
      try {
        let content = readFileSync(absPath, 'utf8');
        content = stripHtmlComments(content);
        // Recursively process nested imports
        const nestedDir = absPath.replace(/[\\/][^\\/]+$/, '');
        content = processImports(content, nestedDir, depth + 1);
        return content.trim();
      } catch {
        return `<!-- import error: ${importPath} -->`;
      }
    },
  );
}

/**
 * Parse simple YAML-like frontmatter from a rule file.
 * Only extracts the `paths` field (array of glob-like strings).
 *
 * Format: --- paths: - "src/_.ts" - "docs/" ---
 */
function parseFrontmatter(content: string): { paths: string[]; body: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return { paths: [], body: content };

  const fmBlock = fmMatch[1];
  const body = fmMatch[2];
  const paths: string[] = [];

  // Extract paths: entries
  const pathsMatch = fmBlock.match(/paths:\s*\n((?:\s+-\s+.*\n?)*)/);
  if (pathsMatch) {
    const lines = pathsMatch[1].split('\n');
    for (const line of lines) {
      const itemMatch = line.match(/^\s+-\s+["']?([^"'\n]+)["']?/);
      if (itemMatch) {
        paths.push(itemMatch[1].trim());
      }
    }
  }

  return { paths, body };
}

/**
 * Load a single instruction file, processing imports and stripping HTML comments.
 */
function loadInstructionFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    let content = readFileSync(filePath, 'utf8');
    content = stripHtmlComments(content);
    const dir = filePath.replace(/[\\/][^\\/]+$/, '');
    content = processImports(content, dir, 0);
    return content.trim();
  } catch {
    return undefined;
  }
}

/**
 * Load all rule files from .spark-cli/rules/*.md
 */
function loadRuleFiles(projectRoot: string): RuleFile[] {
  const rulesDir = join(projectRoot, '.spark-cli', 'rules');
  if (!existsSync(rulesDir)) return [];

  try {
    const files = readdirSync(rulesDir).filter((f) => f.endsWith('.md'));
    const rules: RuleFile[] = [];

    for (const file of files) {
      const filePath = join(rulesDir, file);
      let content = readFileSync(filePath, 'utf8');
      content = stripHtmlComments(content);

      const { paths, body } = parseFrontmatter(content);
      const dir = filePath.replace(/[\\/][^\\/]+$/, '');
      const processed = processImports(body || content, dir, 0).trim();

      if (processed) {
        rules.push({ path: filePath, content: processed, paths });
      }
    }

    return rules;
  } catch {
    return [];
  }
}

/**
 * Result of loading all instruction files.
 */
export interface ProjectInstructions {
  /** User-level instructions (~/.spark-cli/SPARKCLI.md) */
  userInstructions: string;
  /** Project-level instructions (<project>/SPARKCLI.md) */
  projectInstructions: string;
  /** Local instructions (<project>/SPARKCLI.local.md) */
  localInstructions: string;
  /** Path-scoped rules (.spark-cli/rules/*.md) */
  rules: RuleFile[];
  /** Combined instructions for system prompt injection */
  combined: string;
}

/**
 * Load all project instructions from all scopes.
 */
export function loadProjectInstructions(projectRoot: string): ProjectInstructions {
  const userPath = join(getGlobalConfigDir(), 'SPARKCLI.md');
  const projectPath = join(projectRoot, 'SPARKCLI.md');
  const localPath = join(projectRoot, 'SPARKCLI.local.md');

  const userInstructions = loadInstructionFile(userPath) ?? '';
  const projectInstructions = loadInstructionFile(projectPath) ?? '';
  const localInstructions = loadInstructionFile(localPath) ?? '';
  const rules = loadRuleFiles(projectRoot);

  // Build combined output
  const sections: string[] = [];

  if (userInstructions) {
    sections.push(`## User instructions\n\n${userInstructions}`);
  }

  if (projectInstructions) {
    sections.push(`## Project instructions\n\n${projectInstructions}`);
  }

  if (localInstructions) {
    sections.push(`## Local instructions\n\n${localInstructions}`);
  }

  // Always-on rules (no paths filter)
  const globalRules = rules.filter((r) => r.paths.length === 0);
  if (globalRules.length > 0) {
    const ruleBlocks = globalRules.map((r) => r.content).join('\n\n---\n\n');
    sections.push(`## Rules\n\n${ruleBlocks}`);
  }

  const combined = sections.join('\n\n');

  // Enforce size cap
  if (Buffer.byteLength(combined, 'utf8') > MAX_INSTRUCTION_BYTES) {
    const truncated = combined.slice(0, MAX_INSTRUCTION_BYTES);
    return {
      userInstructions,
      projectInstructions,
      localInstructions,
      rules,
      combined: truncated + '\n\n<!-- instructions truncated (too large) -->',
    };
  }

  return {
    userInstructions,
    projectInstructions,
    localInstructions,
    rules,
    combined,
  };
}

/**
 * Get path-scoped rules that apply to a specific file path.
 * Used when the agent is about to operate on a specific file.
 */
export function getPathScopedRules(
  instructions: ProjectInstructions,
  targetPath: string,
): string[] {
  const matching: string[] = [];

  for (const rule of instructions.rules) {
    if (rule.paths.length === 0) continue; // Global rules already included

    const applies = rule.paths.some((pattern) => {
      // Simple glob-like matching: ** matches any path, * matches within a segment
      const regex = patternToRegex(pattern);
      return regex.test(targetPath);
    });

    if (applies) {
      matching.push(rule.content);
    }
  }

  return matching;
}

/**
 * Convert a simple glob-like pattern to a regex.
 * Supports: ** (any path), * (within segment), ? (single char)
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/**
 * Format instructions for injection into the system prompt.
 */
export function formatInstructionsForPrompt(instructions: ProjectInstructions): string | undefined {
  if (!instructions.combined) return undefined;
  return instructions.combined;
}

/** Cache for loaded instructions per project root. */
const instructionsCache = new Map<string, ProjectInstructions>();

/**
 * Get cached project instructions (loaded once per session).
 */
export function getCachedProjectInstructions(projectRoot: string): ProjectInstructions {
  const cached = instructionsCache.get(projectRoot);
  if (cached) return cached;
  const instructions = loadProjectInstructions(projectRoot);
  instructionsCache.set(projectRoot, instructions);
  return instructions;
}

/**
 * Refresh cached instructions (e.g., after /refresh command).
 */
export function refreshProjectInstructions(projectRoot: string): ProjectInstructions {
  instructionsCache.delete(projectRoot);
  return getCachedProjectInstructions(projectRoot);
}

/** Test-only: clear cache. */
export function _resetInstructionsCacheForTests(): void {
  instructionsCache.clear();
}
