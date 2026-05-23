import type { SparkCLIConfig } from '../config/schema.js';

export function isMcpWriteAllowed(config: SparkCLIConfig): boolean {
  return config.mcp?.allowWrite === true;
}

export function mcpWriteDeniedMessage(): string {
  return (
    'MCP write tools are disabled. Set mcp.allowWrite: true in .spark/settings.json ' +
    '(project or ~/.spark/settings.json), then restart the MCP server.'
  );
}
