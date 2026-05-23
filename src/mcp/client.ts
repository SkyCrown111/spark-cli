/**
 * MCP client — connects to external MCP servers and discovers their tools.
 *
 * Uses `@modelcontextprotocol/sdk` Client class with stdio, SSE, or HTTP
 * transport. Each connection produces a `McpClientConnection` that holds the
 * live client and its discovered tool definitions.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerConfig } from '../config/schema.js';
import type { ToolResult } from '../core/agent/tool-registry.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Expand environment variable references in a string.
 * Supports `${VAR}` and `${VAR:-default}` syntax.
 */
export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const colonIdx = expr.indexOf(':-');
    if (colonIdx >= 0) {
      const varName = expr.slice(0, colonIdx);
      const defaultVal = expr.slice(colonIdx + 2);
      return process.env[varName] ?? defaultVal;
    }
    return process.env[expr] ?? '';
  });
}

/**
 * Expand env vars in all string values of a record.
 */
function expandEnvRecord(
  record: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = expandEnvVars(v);
  }
  return out;
}

/** A connected MCP client with its discovered tools. */
export interface McpClientConnection {
  /** Config name for this server. */
  name: string;
  /** The live SDK Client instance. */
  client: Client;
  /** Tools discovered from this server. */
  tools: DiscoveredMcpTool[];
  /** Prompts discovered from this server. */
  prompts: Array<{
    name: string;
    prefixedName: string;
    description?: string;
    arguments?: Array<{ name: string; required?: boolean }>;
  }>;
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
export async function connectToServer(config: McpServerConfig): Promise<McpClientConnection> {
  const client = new Client(
    { name: `spark-cli-client-${config.name}`, version: '0.1.0' },
    { capabilities: {} },
  );

  // Expand environment variables in config values
  const expandedCommand = config.command ? expandEnvVars(config.command) : undefined;
  const expandedUrl = config.url ? expandEnvVars(config.url) : undefined;
  const expandedEnv = expandEnvRecord(config.env);
  const expandedHeaders = expandEnvRecord(
    (config as McpServerConfig & { headers?: Record<string, string> }).headers,
  );

  if (config.transport === 'stdio') {
    if (!expandedCommand) {
      throw new Error(`MCP server "${config.name}": stdio transport requires 'command'.`);
    }
    const transport = new StdioClientTransport({
      command: expandedCommand,
      args: config.args,
      env: expandedEnv,
      stderr: 'pipe',
    });
    await client.connect(transport);
  } else if (config.transport === 'sse') {
    if (!expandedUrl) {
      throw new Error(`MCP server "${config.name}": sse transport requires 'url'.`);
    }
    const urlObj = new URL(expandedUrl);
    const transport = new SSEClientTransport(urlObj, {
      requestInit: expandedHeaders
        ? { headers: expandedHeaders as Record<string, string> }
        : undefined,
    });
    await client.connect(transport);
  } else if (config.transport === 'http') {
    if (!expandedUrl) {
      throw new Error(`MCP server "${config.name}": http transport requires 'url'.`);
    }
    // Dynamic import to avoid hard dependency on the HTTP transport module
    let StreamableHTTPClientTransport: typeof import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport;
    try {
      const mod = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      StreamableHTTPClientTransport = mod.StreamableHTTPClientTransport;
    } catch {
      throw new Error(
        `MCP server "${config.name}": http transport requires @modelcontextprotocol/sdk >= 1.12.0.`,
      );
    }
    const transport = new StreamableHTTPClientTransport(new URL(expandedUrl), {
      requestInit: expandedHeaders
        ? { headers: expandedHeaders as Record<string, string> }
        : undefined,
    });
    await client.connect(transport);
  } else {
    throw new Error(`MCP server "${config.name}": unknown transport "${config.transport}".`);
  }

  const tools = await discoverTools(client, config.name);
  const prompts = await discoverPrompts(client, config.name);

  return { name: config.name, client, tools, prompts };
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
      content: `MCP tool "${toolName}" failed: ${getErrorMessage(e)}`,
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
 * Discover prompts from a connected MCP client (best-effort).
 * Returns an empty array if the server doesn't support prompts.
 */
export async function discoverPrompts(
  client: Client,
  serverName: string,
): Promise<
  Array<{
    name: string;
    prefixedName: string;
    description?: string;
    arguments?: Array<{ name: string; required?: boolean }>;
  }>
> {
  try {
    const result = await client.listPrompts();
    return result.prompts.map((p) => ({
      name: p.name,
      prefixedName: `${serverName}__${p.name}`,
      description: p.description,
      arguments: p.arguments as Array<{ name: string; required?: boolean }> | undefined,
    }));
  } catch {
    // Server may not support prompts
    return [];
  }
}

/**
 * Get a prompt from a connected MCP client.
 */
export async function getPrompt(
  client: Client,
  promptName: string,
  args?: Record<string, string>,
): Promise<string> {
  try {
    const result = await client.getPrompt({ name: promptName, arguments: args });
    const parts = result.messages
      .filter((m) => m.content.type === 'text')
      .map((m) => (m.content as { text: string }).text);
    return parts.join('\n') || JSON.stringify(result);
  } catch (e) {
    return `MCP prompt "${promptName}" failed: ${getErrorMessage(e)}`;
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
