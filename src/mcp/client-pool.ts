/**
 * MCP client pool — manages multiple MCP server connections.
 *
 * Connects to all enabled MCP servers from config, discovers their tools,
 * and provides them as `RegisteredTool` entries for the agent tool registry.
 * Supports auto-reconnect with exponential backoff for HTTP/SSE servers.
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
import { loadMcpJson, mergeMcpServers } from './mcp-json.js';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY_MS = 1000;

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
  /** Attempt to reconnect a specific server by name. Returns true on success. */
  reconnect(serverName: string): Promise<boolean>;
}

/**
 * Connect to all enabled MCP servers in config and return a pool.
 * Servers that fail to connect are logged to stderr but don't block others.
 * Also loads servers from `.mcp.json` in the project root (if present).
 */
export async function connectAll(
  config: SparkCLIConfig,
  projectRoot?: string,
): Promise<McpClientPool> {
  const configServers = config.mcp?.servers ?? [];
  const mcpJsonServers = projectRoot ? loadMcpJson(projectRoot) : [];
  const allServers = mergeMcpServers(configServers, mcpJsonServers);
  const enabled = allServers.filter((s) => s.enabled !== false);

  const connections: McpClientConnection[] = [];
  const allTools: DiscoveredMcpTool[] = [];
  const serverConfigs = new Map<string, (typeof enabled)[0]>();

  for (const serverConfig of enabled) {
    serverConfigs.set(serverConfig.name, serverConfig);
    try {
      const conn = await connectToServer(serverConfig);
      connections.push(conn);
      allTools.push(...conn.tools);
    } catch (e) {
      // Log but don't block other servers
      logger.error(
        `[spark-cli] Failed to connect to MCP server "${serverConfig.name}": ${getErrorMessage(e)}`,
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
    async reconnect(serverName: string): Promise<boolean> {
      const cfg = serverConfigs.get(serverName);
      if (!cfg) return false;

      // Disconnect existing connection if any
      const existingIdx = connections.findIndex((c) => c.name === serverName);
      if (existingIdx >= 0) {
        await disconnectClient(connections[existingIdx]!).catch(() => {});
        connections.splice(existingIdx, 1);
        // Remove old tools
        for (let i = allTools.length - 1; i >= 0; i--) {
          if (allTools[i]!.prefixedName.startsWith(`${serverName}__`)) {
            allTools.splice(i, 1);
          }
        }
      }

      // Attempt reconnect with exponential backoff
      for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
        try {
          const conn = await connectToServer(cfg);
          connections.push(conn);
          allTools.push(...conn.tools);
          return true;
        } catch {
          if (attempt < MAX_RECONNECT_ATTEMPTS - 1) {
            const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      return false;
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
        // Try the call; on failure, attempt reconnect and retry once
        let result = await callTool(conn.client, tool.name, args);
        if (result.isError && result.content.includes('failed')) {
          const reconnected = await pool.reconnect(conn.name);
          if (reconnected) {
            const newConn = pool.getConnectionForTool(tool.prefixedName);
            if (newConn) {
              result = await callTool(newConn.client, tool.name, args);
            }
          }
        }
        return result;
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
  projectRoot?: string,
): Promise<{ pool: McpClientPool; tools: RegisteredTool[] }> {
  const pool = await connectAll(config, projectRoot);
  const tools = buildRegisteredTools(pool);
  return { pool, tools };
}
