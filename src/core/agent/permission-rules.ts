/**
 * Config-driven permission rules using the Tool(specifier) glob syntax.
 *
 * Specifier format:
 *   - `Tool(name)` — matches any call to the named tool
 *   - `Tool(name:*)` — matches all calls to the named tool
 *   - `Tool(name:path/**)` — matches calls where a path arg matches the glob
 *   - `Tool(*:path/**)` — matches any tool targeting the given path glob
 *   - `Tool(*)` — matches all tools
 *
 * Evaluation: rules are processed in order; first match wins.
 * Order of precedence: deny → ask → allow (deny always wins if matched first).
 */

import { minimatch } from 'minimatch';

export interface ToolRule {
  /** Specifier string like "Tool(bash)", "Tool(write_file:src/**)", etc. */
  specifier: string;
  /** Action to take when the specifier matches. */
  action: 'deny' | 'ask' | 'allow';
}

export interface ParsedSpecifier {
  /** Glob pattern for tool names. "*" matches any tool. */
  toolPattern: string;
  /** Optional glob pattern for path arguments. Undefined = match any path. */
  pathPattern?: string;
}

/**
 * Parse a Tool(specifier) string into tool and path pattern components.
 *
 * Examples:
 *   Tool(bash)           → { toolPattern: "bash" }
 *   Tool(bash:*)         → { toolPattern: "bash" }
 *   Tool(write_file)     → { toolPattern: "write_file" }
 *   Tool(write_file:src/**)  → { toolPattern: "write_file", pathPattern: "src/**" }
 *   Tool(*:.git/*)       → { toolPattern: "*", pathPattern: ".git/*" }
 *   Tool(*)              → { toolPattern: "*" }
 */
export function parseSpecifier(specifier: string): ParsedSpecifier {
  // Strip "Tool(" prefix and ")" suffix
  const inner = specifier.replace(/^Tool\(/, '').replace(/\)$/, '');
  const colonIdx = inner.indexOf(':');

  if (colonIdx === -1) {
    return { toolPattern: inner };
  }

  const toolPattern = inner.slice(0, colonIdx);
  const pathPattern = inner.slice(colonIdx + 1);

  // "*" as path pattern means "any path" — same as no path pattern
  if (pathPattern === '*') {
    return { toolPattern };
  }

  return { toolPattern, pathPattern };
}

/**
 * Check if a parsed specifier matches a given tool name and (optional) path arg.
 */
export function specifierMatches(
  parsed: ParsedSpecifier,
  toolName: string,
  pathArgs: string[],
): boolean {
  // Tool name match: "*" matches any tool; otherwise use minimatch glob
  const toolMatch =
    parsed.toolPattern === '*' || minimatch(toolName, parsed.toolPattern);

  if (!toolMatch) return false;

  // If no path pattern, the specifier matches any call to this tool
  if (!parsed.pathPattern) return true;

  // If path pattern exists, at least one path arg must match it
  if (pathArgs.length === 0) return false;

  return pathArgs.some((p) => parsed.pathPattern != undefined && minimatch(p, parsed.pathPattern));
}

/**
 * Evaluate config-driven permission rules against a tool call.
 *
 * Rules are processed in order; first matching rule wins.
 * Returns the action ('deny' | 'ask' | 'allow') or undefined if no rule matches.
 */
export function evaluateRules(
  rules: ToolRule[],
  toolName: string,
  pathArgs: string[],
): 'deny' | 'ask' | 'allow' | undefined {
  for (const rule of rules) {
    const parsed = parseSpecifier(rule.specifier);
    if (specifierMatches(parsed, toolName, pathArgs)) {
      return rule.action;
    }
  }
  return undefined;
}

/**
 * Extract path-like arguments from tool call args.
 * Checks common arg names: path, file_path, filePath, target, destination, dir, directory.
 */
export function extractPathArgs(args: Record<string, unknown>): string[] {
  const PATH_KEYS = ['path', 'file_path', 'filePath', 'target', 'destination', 'dir', 'directory'];
  const paths: string[] = [];
  for (const key of PATH_KEYS) {
    if (typeof args[key] === 'string') {
      paths.push(args[key]);
    }
  }
  return paths;
}