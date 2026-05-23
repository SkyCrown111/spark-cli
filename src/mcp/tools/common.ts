/**
 * Shared helpers for MCP tool handlers.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { SparkCLIConfig } from '../../config/schema.js';
import { detectEngine } from '../../engines/registry.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export function textResult(obj: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    isError,
  };
}

export function cliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = join(here, '..', 'cli.js');
  if (existsSync(bundled)) return bundled;
  return join(process.cwd(), 'dist', 'cli.js');
}

export function mcpEngine(projectRoot: string, config: SparkCLIConfig) {
  return detectEngine(projectRoot, config.project?.engine).id;
}
