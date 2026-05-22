/**
 * .mcp.json loader — reads project-level MCP server configuration.
 *
 * Supports the same format as Claude Code's `.mcp.json`:
 * ```json
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "npx",
 *       "args": ["-y", "some-mcp-server"],
 *       "env": { "KEY": "value" }
 *     }
 *   }
 * }
 * ```
 *
 * Servers defined here are merged with those in `spark-cli.config.yaml`,
 * with `.mcp.json` taking precedence for same-named entries.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerConfig } from '../config/schema.js';

interface McpJsonServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface McpJson {
  mcpServers?: Record<string, McpJsonServer>;
}

/**
 * Load MCP server configs from `.mcp.json` in the project root.
 * Returns an empty array if the file doesn't exist or is invalid.
 */
export function loadMcpJson(projectRoot: string): McpServerConfig[] {
  const mcpJsonPath = join(projectRoot, '.mcp.json');
  if (!existsSync(mcpJsonPath)) return [];

  try {
    const raw = readFileSync(mcpJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as McpJson;
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') return [];

    const servers: McpServerConfig[] = [];
    for (const [name, cfg] of Object.entries(parsed.mcpServers)) {
      if (!cfg || typeof cfg !== 'object') continue;

      if (cfg.url) {
        // SSE/HTTP server — infer transport from URL or default to sse
        const transport: 'sse' | 'http' = cfg.url.includes('/mcp') ? 'http' : 'sse';
        servers.push({
          name,
          transport,
          url: cfg.url,
          headers: cfg.headers,
          env: cfg.env,
          enabled: true,
        });
      } else if (cfg.command) {
        // stdio server
        servers.push({
          name,
          transport: 'stdio',
          command: cfg.command,
          args: cfg.args ?? [],
          env: cfg.env,
          enabled: true,
        });
      }
    }

    return servers;
  } catch {
    return [];
  }
}

/**
 * Merge MCP servers from config and .mcp.json.
 * .mcp.json entries override same-named config entries.
 */
export function mergeMcpServers(
  configServers: McpServerConfig[],
  mcpJsonServers: McpServerConfig[],
): McpServerConfig[] {
  const merged = new Map<string, McpServerConfig>();

  // Config servers first
  for (const s of configServers) {
    merged.set(s.name, s);
  }

  // .mcp.json overrides
  for (const s of mcpJsonServers) {
    merged.set(s.name, s);
  }

  return Array.from(merged.values());
}
