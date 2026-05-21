/**
 * MCP client pool — manages multiple MCP server connections.
 *
 * Connects to all enabled MCP servers from config, discovers their tools,
 * and provides them as `RegisteredTool` entries for the agent tool registry.
 */

import type { SparkCLIConfig } from '../config/schema.js';
import type { RegisteredTool, ToolResult } from '../core/agent/tool-registry.js';
import {
  connectToServer,
  callTool,
  disconnectClient,
  type McpClientConnection,
  type DiscoveredMcpTool,
} from './client.js';

/** Active pool of MCP client connections. */
export interface McpClientPool {
  /** All active connections. */
  connections: McpClientConnection[];
  /** All discovered tools across all connections. */
  allTools: DiscoveredMcpTool[];
  /** Get the connection that owns a given prefixed tool name. */
  getConnectionForTool(prefixedName: string): McpClientConnection | undefined;
  /** Disconnect all servers. */
  disconnectAll(): Promise<void>;
}

/**
 * Connect to all enabled MCP servers in config and return a pool.
 * Servers that fail to connect are logged to stderr but don't block others.
 */
export async function connectAll(config: SparkCLIConfig): Promise<McpClientPool> {
  const servers = config.mcp?.servers ?? [];
  const enabled = servers.filter((s) => s.enabled !== false);

  const connections: McpClientConnection[] = [];
  const allTools: DiscoveredMcpTool[] = [];

  for (const serverConfig of enabled) {
    try {
      const conn = await connectToServer(serverConfig);
      connections.push(conn);
      allTools.push(...conn.tools);
    } catch (e) {
      // Log but don't block other servers
      console.error(
        `[spark-cli] Failed to connect to MCP server "${serverConfig.name}": ${(e as Error).message}`,
      );
    }
  }

  return {
    connections,
    allTools,
    getConnectionForTool(prefixedName: string): McpClientConnection | undefined {
      // Tool names are prefixed as `<serverName>__<toolName>`
      for (const conn of connections) {
        if (prefixedName.startsWith(`${conn.name}__`)) {
          return conn;
        }
      }
      return undefined;
    },
    async disconnectAll(): Promise<void> {
      await Promise.all(connections.map((c) => disconnectClient(c)));
    },
  };
}

/**
 * Convert discovered MCP tools into `RegisteredTool` entries for the agent
 * tool registry. Each tool's handler delegates to the MCP client via `callTool`.
 */
export function buildRegisteredTools(pool: McpClientPool): RegisteredTool[] {
  return pool.allTools.map((tool) => {
    const conn = pool.getConnectionForTool(tool.prefixedName);
    if (!conn) {
      throw new Error(`No connection found for tool "${tool.prefixedName}"`);
    }

    const registered: RegisteredTool = {
      name: tool.prefixedName,
      description: `[MCP:${conn.name}] ${tool.description}`,
      parameters: tool.parameters,
      planModeAllowed: tool.readOnly,
      mutates: !tool.readOnly,
      source: 'mcp-client',
      mcpServerName: conn.name,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        return callTool(conn.client, tool.name, args);
      },
    };
    return registered;
  });
}

/**
 * High-level: connect to all servers and return both the pool and the
 * registered tools ready for the agent registry.
 */
export async function connectMcpClients(
  config: SparkCLIConfig,
): Promise<{ pool: McpClientPool; tools: RegisteredTool[] }> {
  const pool = await connectAll(config);
  const tools = buildRegisteredTools(pool);
  return { pool, tools };
}
