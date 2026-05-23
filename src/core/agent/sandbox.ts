/**
 * Sandbox — filesystem and network access control.
 *
 * Provides configurable restrictions on file paths and network domains
 * to isolate agent operations within safe boundaries.
 */

import { resolve, relative, isAbsolute } from 'node:path';
import { minimatch } from 'minimatch';

export interface SandboxConfig {
  /** Enable sandbox mode. */
  enabled: boolean;
  /** Allowed file paths (glob patterns). Empty = all paths under project root. */
  allowPaths: string[];
  /** Denied file paths (glob patterns). Evaluated after allowPaths. */
  denyPaths: string[];
  /** Allowed domains for network access. Empty = all domains. */
  allowDomains: string[];
  /** Denied domains for network access. Evaluated after allowDomains. */
  denyDomains: string[];
  /** Auto-allow bash commands when sandbox is enabled. */
  autoAllowBash: boolean;
}

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: false,
  allowPaths: [],
  denyPaths: [],
  allowDomains: [],
  denyDomains: [],
  autoAllowBash: false,
};

/**
 * Create a sandbox config from partial config, filling defaults.
 */
export function createSandboxConfig(partial?: Partial<SandboxConfig>): SandboxConfig {
  return { ...DEFAULT_SANDBOX_CONFIG, ...partial };
}

/**
 * Check if a file path is allowed by the sandbox.
 *
 * @returns `{ allowed: true }` if allowed, or `{ allowed: false, reason }` if denied.
 */
export function checkFilePath(
  filePath: string,
  projectRoot: string,
  config: SandboxConfig,
): { allowed: true } | { allowed: false; reason: string } {
  if (!config.enabled) return { allowed: true };

  const resolved = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
  const relPath = relative(projectRoot, resolved);

  // Check deny list first (deny takes precedence)
  for (const pattern of config.denyPaths) {
    if (minimatch(relPath, pattern, { dot: true })) {
      return { allowed: false, reason: `Path matches denied pattern: ${pattern}` };
    }
  }

  // If allow list is empty, all paths under project root are allowed
  if (config.allowPaths.length === 0) {
    // Ensure path is under project root
    if (relPath.startsWith('..')) {
      return { allowed: false, reason: 'Path is outside project root' };
    }
    return { allowed: true };
  }

  // Check allow list
  for (const pattern of config.allowPaths) {
    if (minimatch(relPath, pattern, { dot: true })) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: `Path not in allowed list: ${relPath}` };
}

/**
 * Check if a domain is allowed by the sandbox.
 *
 * @returns `{ allowed: true }` if allowed, or `{ allowed: false, reason }` if denied.
 */
export function checkDomain(
  domain: string,
  config: SandboxConfig,
): { allowed: true } | { allowed: false; reason: string } {
  if (!config.enabled) return { allowed: true };

  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

  // Check deny list first
  for (const pattern of config.denyDomains) {
    if (matchesDomainPattern(normalizedDomain, pattern)) {
      return { allowed: false, reason: `Domain matches denied pattern: ${pattern}` };
    }
  }

  // If allow list is empty, all domains are allowed
  if (config.allowDomains.length === 0) {
    return { allowed: true };
  }

  // Check allow list
  for (const pattern of config.allowDomains) {
    if (matchesDomainPattern(normalizedDomain, pattern)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: `Domain not in allowed list: ${normalizedDomain}` };
}

/**
 * Check if a bash command is allowed by the sandbox.
 *
 * When `autoAllowBash` is true, all commands are allowed.
 * Otherwise, commands are checked against the same rules as other tools.
 */
export function checkBashCommand(
  command: string,
  config: SandboxConfig,
): { allowed: true } | { allowed: false; reason: string } {
  if (!config.enabled) return { allowed: true };
  if (config.autoAllowBash) return { allowed: true };

  // Check for dangerous patterns
  const dangerousPatterns = [
    /\brm\s+-rf?\s+[\/~]/, // rm -rf / or ~
    />\s*\/dev\/sd[a-z]/, // Write to disk device
    /\bmkfs\b/, // Format filesystem
    /\bdd\s+.*of=\/dev\//, // dd to device
    /\b:(){ :|:& };:/, // Fork bomb
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Command matches dangerous pattern` };
    }
  }

  return { allowed: true };
}

/**
 * Check if a URL is allowed by the sandbox.
 */
export function checkUrl(
  url: string,
  config: SandboxConfig,
): { allowed: true } | { allowed: false; reason: string } {
  if (!config.enabled) return { allowed: true };

  try {
    const parsed = new URL(url);
    return checkDomain(parsed.hostname, config);
  } catch {
    return { allowed: false, reason: `Invalid URL: ${url}` };
  }
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Check if a domain matches a pattern.
 * Supports wildcard patterns like *.example.com
 */
function matchesDomainPattern(domain: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase().replace(/^www\./, '');

  // Exact match
  if (domain === normalizedPattern) return true;

  // Wildcard match: *.example.com matches sub.example.com
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1); // .example.com
    return domain.endsWith(suffix) || domain === suffix.slice(1);
  }

  return false;
}

/**
 * Extract domain from a URL string.
 */
export function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Extract file paths from tool arguments.
 */
export function extractPathsFromArgs(tool: string, args: Record<string, unknown>): string[] {
  const paths: string[] = [];

  // Common path argument names
  const pathKeys = ['path', 'file', 'filePath', 'dir', 'directory', 'source', 'target', 'output'];

  for (const key of pathKeys) {
    if (typeof args[key] === 'string') {
      paths.push(args[key]);
    }
  }

  // Bash command: extract paths from command string
  if (tool === 'bash' && typeof args.command === 'string') {
    const cmd = args.command;
    // Simple extraction of paths after common commands
    const pathPatterns = [
      /(?:cat|head|tail|less|more|grep|find|ls|cd|mkdir|rm|cp|mv|touch|chmod|chown)\s+([^\s;|&]+)/g,
      /(?:>|>>)\s*([^\s;|&]+)/g,
    ];
    for (const pattern of pathPatterns) {
      let match;
      while ((match = pattern.exec(cmd)) !== null) {
        if (match[1] && !match[1].startsWith('-')) {
          paths.push(match[1]);
        }
      }
    }
  }

  return paths;
}
