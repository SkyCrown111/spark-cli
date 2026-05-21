/**
 * MCP client — connects to external MCP servers and discovers their tools.
 *
 * Uses `@modelcontextprotocol/sdk` Client class with stdio or SSE transport.
 * Each connection produces a `McpClientConnection` that holds the live client
 * and its discovered tool definitions.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerConfig } from '../config/schema.js';
import type { ToolResult } from '../core/agent/tool-registry.js';

/** A connected MCP client with its discovered tools. */
export interface McpClientConnection {
  /** Config name for this server. */
  name: string;
  /** The live SDK Client instance. */
  client: Client;
  /** Tools discovered from this server. */
  tools: DiscoveredMcpTool[];
}

/** A tool discovered from an MCP server, ready to be registered. */
export interface DiscoveredMcpTool {
  /** Original tool name from the server. */
  name: string;
  /** Prefixed name for the registry: `<serverName>__<toolName>`. */
  prefixedName: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Whether the tool is read-only (from annotations). */
  readOnly: boolean;
}

/**
 * Connect to a single MCP server described by `config`.
 * Returns a `McpClientConnection` with the live client and discovered tools.
 */
export async function connectToServer(
  config: McpServerConfig,
): Promise<McpClientConnection> {
  const client = new Client(
    { name: `spark-cli-client-${config.name}`, version: '0.1.0' },
    { capabilities: {} },
  );

  if (config.transport === 'stdio') {
    if (!config.command) {
      throw new Error(`MCP server "${config.name}": stdio transport requires 'command'.`);
    }
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      stderr: 'pipe',
    });
    await client.connect(transport);
  } else if (config.transport === 'sse') {
    if (!config.url) {
      throw new Error(`MCP server "${config.name}": sse transport requires 'url'.`);
    }
    const transport = new SSEClientTransport(new URL(config.url));
    await client.connect(transport);
  } else {
    throw new Error(`MCP server "${config.name}": unknown transport "${config.transport}".`);
  }

  const tools = await discoverTools(client, config.name);

  return { name: config.name, client, tools };
}

/**
 * Discover tools from a connected MCP client.
 * Tool names are prefixed with the server name to avoid collisions:
 * `<serverName>__<toolName>`.
 */
export async function discoverTools(
  client: Client,
  serverName: string,
): Promise<DiscoveredMcpTool[]> {
  const result = await client.listTools();
  return result.tools.map((t) => {
    const readOnly = t.annotations?.readOnlyHint === true;
    return {
      name: t.name,
      prefixedName: `${serverName}__${t.name}`,
      description: t.description ?? '',
      parameters: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
      readOnly,
    };
  });
}

/**
 * Call a tool on a connected MCP client.
 * Returns a `ToolResult` compatible with the agent tool registry.
 */
export async function callTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    // The SDK returns { content: [...], isError? }
    const content = result.content;
    if (Array.isArray(content)) {
      const textParts = content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text);
      const joined = textParts.join('\n');
      return {
        content: joined || JSON.stringify(result),
        isError: result.isError === true,
      };
    }
    return { content: JSON.stringify(result) };
  } catch (e) {
    return {
      content: `MCP tool "${toolName}" failed: ${(e as Error).message}`,
      isError: true,
    };
  }
}

/**
 * Discover resources from a connected MCP client (best-effort).
 * Returns an empty array if the server doesn't support resources.
 */
export async function discoverResources(
  client: Client,
): Promise<Array<{ uri: string; name: string; description?: string }>> {
  try {
    const result = await client.listResources();
    return result.resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
    }));
  } catch {
    // Server may not support resources
    return [];
  }
}

/**
 * Disconnect a client connection gracefully.
 */
export async function disconnectClient(conn: McpClientConnection): Promise<void> {
  try {
    await conn.client.close();
  } catch {
    // Best-effort cleanup
  }
}
