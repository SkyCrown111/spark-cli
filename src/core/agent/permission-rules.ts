/**
 * Config-driven permission rules using the Tool(specifier) glob syntax.
 *
 * Specifier formats:
 *   - `Tool(name)` — matches any call to the named tool
 *   - `Tool(name:*)` — matches all calls to the named tool
 *   - `Tool(name:path/**)` — matches calls where a path arg matches the glob
 *   - `Tool(*:path/**)` — matches any tool targeting the given path glob
 *   - `Tool(*)` — matches all tools
 *   - `Bash(command pattern)` — matches bash tool with command glob
 *   - `Read(path/**)` — matches read_file tool with path glob
 *   - `WebFetch(domain:example.com)` — matches web_fetch by URL domain
 *   - `WebFetch(url:**)` — matches web_fetch by URL glob
 *   - `Agent(name)` — matches agent tool with agent name glob
 *   - `mcp__server__tool` — matches MCP tool by full name
 *
 * Evaluation: rules are processed in order; first match wins.
 * Order of precedence: deny → ask → allow (deny always wins if matched first).
 */

import { minimatch } from 'minimatch';

export interface ToolRule {
  /** Specifier string like "Tool(bash)", "Bash(npm run *)", etc. */
  specifier: string;
  /** Action to take when the specifier matches. */
  action: 'deny' | 'ask' | 'allow';
}

export type SpecifierKind = 'tool' | 'bash' | 'read' | 'webfetch' | 'agent' | 'mcp';

export interface ParsedSpecifier {
  /** The kind of specifier (determines how matching works). */
  kind: SpecifierKind;
  /** Glob pattern for tool names. "*" matches any tool. */
  toolPattern: string;
  /** Optional glob pattern for path arguments. Undefined = match any path. */
  pathPattern?: string;
  /** Optional glob pattern for command arguments (Bash specifiers). */
  commandPattern?: string;
  /** Optional domain pattern (WebFetch specifiers). */
  domainPattern?: string;
  /** Optional URL glob pattern (WebFetch specifiers). */
  urlPattern?: string;
}

/**
 * Parse a specifier string into its components.
 *
 * Formats: Tool(name:path), Bash(cmd), Read(path), WebFetch(domain:x), Agent(name), mcp__*
 */
export function parseSpecifier(specifier: string): ParsedSpecifier {
  // ── Bash(command) ──
  const bashMatch = specifier.match(/^Bash\((.+)\)$/);
  if (bashMatch) {
    return {
      kind: 'bash',
      toolPattern: 'bash',
      commandPattern: bashMatch[1],
    };
  }

  // ── Read(path) ──
  const readMatch = specifier.match(/^Read\((.+)\)$/);
  if (readMatch) {
    const pattern = readMatch[1];
    return {
      kind: 'read',
      toolPattern: 'read_file',
      pathPattern: pattern === '*' ? undefined : pattern,
    };
  }

  // ── WebFetch(domain:... | url:...) ──
  const webfetchMatch = specifier.match(/^WebFetch\((.+)\)$/);
  if (webfetchMatch) {
    const inner = webfetchMatch[1];
    const colonIdx = inner.indexOf(':');
    if (colonIdx > 0) {
      const key = inner.slice(0, colonIdx);
      const value = inner.slice(colonIdx + 1);
      if (key === 'domain') {
        return { kind: 'webfetch', toolPattern: 'web_fetch', domainPattern: value };
      }
      if (key === 'url') {
        return {
          kind: 'webfetch',
          toolPattern: 'web_fetch',
          urlPattern: value === '*' ? undefined : value,
        };
      }
    }
    // No prefix — treat as domain pattern
    return { kind: 'webfetch', toolPattern: 'web_fetch', domainPattern: inner };
  }

  // ── Agent(name) ──
  const agentMatch = specifier.match(/^Agent\((.+)\)$/);
  if (agentMatch) {
    return {
      kind: 'agent',
      toolPattern: 'agent',
      commandPattern: agentMatch[1],
    };
  }

  // ── mcp__* (MCP tool by full name) ──
  if (specifier.startsWith('mcp__')) {
    return {
      kind: 'mcp',
      toolPattern: specifier,
    };
  }

  // ── Tool(name:path) or Tool(name) ──
  const inner = specifier.replace(/^Tool\(/, '').replace(/\)$/, '');
  const colonIdx = inner.indexOf(':');

  if (colonIdx === -1) {
    return { kind: 'tool', toolPattern: inner };
  }

  const toolPattern = inner.slice(0, colonIdx);
  const pathPattern = inner.slice(colonIdx + 1);

  // "*" as path pattern means "any path" — same as no path pattern
  if (pathPattern === '*') {
    return { kind: 'tool', toolPattern };
  }

  return { kind: 'tool', toolPattern, pathPattern };
}

/**
 * Check if a parsed specifier matches a given tool name and context.
 *
 * @param parsed - The parsed specifier
 * @param toolName - The tool name being checked
 * @param pathArgs - Extracted path arguments from the tool call
 * @param commandArg - For bash tools, the command string
 * @param urlArg - For web_fetch tools, the URL string
 * @param agentName - For agent tools, the agent/sub-agent name
 */
export function specifierMatches(
  parsed: ParsedSpecifier,
  toolName: string,
  pathArgs: string[],
  commandArg?: string,
  urlArg?: string,
  agentName?: string,
): boolean {
  // Tool name match: "*" matches any tool; otherwise use minimatch glob
  const toolMatch = parsed.toolPattern === '*' || minimatch(toolName, parsed.toolPattern);

  if (!toolMatch) return false;

  // ── Bash specifier: match command argument ──
  if (parsed.kind === 'bash' && parsed.commandPattern) {
    if (!commandArg) return false;
    return minimatch(commandArg, parsed.commandPattern);
  }

  // ── Read specifier: match path argument ──
  if (parsed.kind === 'read' && parsed.pathPattern) {
    if (pathArgs.length === 0) return false;
    return pathArgs.some((p) => minimatch(p, parsed.pathPattern!));
  }

  // ── WebFetch specifier: match domain or URL ──
  if (parsed.kind === 'webfetch') {
    if (parsed.domainPattern && urlArg) {
      try {
        const url = new URL(urlArg);
        return minimatch(url.hostname, parsed.domainPattern);
      } catch {
        return false;
      }
    }
    if (parsed.urlPattern && urlArg) {
      return minimatch(urlArg, parsed.urlPattern);
    }
    // No domain/url pattern — matches any web_fetch call
    return !parsed.domainPattern && !parsed.urlPattern;
  }

  // ── Agent specifier: match agent name ──
  if (parsed.kind === 'agent' && parsed.commandPattern) {
    if (!agentName) return false;
    return minimatch(agentName, parsed.commandPattern);
  }

  // ── MCP specifier: tool name already matched above ──
  if (parsed.kind === 'mcp') {
    return true;
  }

  // ── Tool specifier: match path if specified ──
  if (parsed.pathPattern) {
    if (pathArgs.length === 0) return false;
    return pathArgs.some((p) => minimatch(p, parsed.pathPattern!));
  }

  return true;
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
  commandArg?: string,
  urlArg?: string,
  agentName?: string,
): 'deny' | 'ask' | 'allow' | undefined {
  for (const rule of rules) {
    const parsed = parseSpecifier(rule.specifier);
    if (specifierMatches(parsed, toolName, pathArgs, commandArg, urlArg, agentName)) {
      return rule.action;
    }
  }
  return undefined;
}

/**
 * Extract all matchable arguments from tool call args.
 * Returns path-like args, and optionally the command/url/agent strings.
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

/**
 * Extract the command argument from bash tool args.
 */
export function extractCommandArg(args: Record<string, unknown>): string | undefined {
  if (typeof args.command === 'string') return args.command;
  return undefined;
}

/**
 * Extract the URL argument from web_fetch tool args.
 */
export function extractUrlArg(args: Record<string, unknown>): string | undefined {
  if (typeof args.url === 'string') return args.url;
  return undefined;
}

/**
 * Extract the agent name from agent tool args.
 */
export function extractAgentName(args: Record<string, unknown>): string | undefined {
  if (typeof args.agent === 'string') return args.agent;
  if (typeof args.name === 'string') return args.name;
  if (typeof args.subagent_type === 'string') return args.subagent_type;
  return undefined;
}
