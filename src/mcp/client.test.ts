import { describe, it, expect, vi } from 'vitest';
import type { McpServerConfig } from '../config/schema.js';
import { DEFAULT_CONFIG } from '../config/schema.js';

// Mock the SDK modules before importing our client
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'echo',
            description: 'Echo back the input',
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
          },
          {
            name: 'read_data',
            description: 'Read some data',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true },
          },
        ],
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'tool result' }],
      }),
      listResources: vi.fn().mockResolvedValue({
        resources: [{ uri: 'test://resource', name: 'Test Resource', description: 'A test' }],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  return {
    SSEClientTransport: vi.fn().mockImplementation(() => ({})),
  };
});

import { connectToServer, callTool, discoverResources, disconnectClient } from './client.js';
import { connectAll, buildRegisteredTools, connectMcpClients } from './client-pool.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('MCP client', () => {
  const stdioConfig: McpServerConfig = {
    name: 'test-server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  };

  it('connects to a stdio server and discovers tools', async () => {
    const conn = await connectToServer(stdioConfig);
    expect(conn.name).toBe('test-server');
    expect(conn.tools).toHaveLength(2);
    expect(conn.tools[0].name).toBe('echo');
    expect(conn.tools[0].prefixedName).toBe('test-server__echo');
    expect(conn.tools[0].readOnly).toBe(false);
    expect(conn.tools[1].readOnly).toBe(true);
    expect(conn.tools[1].prefixedName).toBe('test-server__read_data');
  });

  it('throws if stdio config has no command', async () => {
    const badConfig: McpServerConfig = {
      name: 'bad',
      transport: 'stdio',
    };
    await expect(connectToServer(badConfig)).rejects.toThrow(/requires 'command'/);
  });

  it('calls a tool and returns ToolResult', async () => {
    const conn = await connectToServer(stdioConfig);
    const result = await callTool(conn.client, 'echo', { message: 'hello' });
    expect(result.content).toBe('tool result');
    expect(result.isError).toBeFalsy();
  });

  it('handles tool call errors gracefully', async () => {
    const conn = await connectToServer(stdioConfig);
    // Override callTool to throw
    vi.mocked(conn.client.callTool).mockRejectedValueOnce(new Error('network error'));
    const result = await callTool(conn.client, 'echo', { message: 'hello' });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/network error/);
  });

  it('discovers resources', async () => {
    const conn = await connectToServer(stdioConfig);
    const resources = await discoverResources(conn.client);
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe('test://resource');
  });

  it('returns empty array when server has no resources', async () => {
    const conn = await connectToServer(stdioConfig);
    vi.mocked(conn.client.listResources).mockRejectedValueOnce(new Error('not supported'));
    const resources = await discoverResources(conn.client);
    expect(resources).toHaveLength(0);
  });

  it('disconnects gracefully', async () => {
    const conn = await connectToServer(stdioConfig);
    await disconnectClient(conn);
    expect(conn.client.close).toHaveBeenCalled();
  });
});

describe('MCP client-pool', () => {
  it('connects to all enabled servers', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'server-a',
            transport: 'stdio' as const,
            command: 'node',
            args: ['a.js'],
          },
          {
            name: 'server-b',
            transport: 'stdio' as const,
            command: 'node',
            args: ['b.js'],
          },
        ],
      },
    };

    const pool = await connectAll(config);
    expect(pool.connections).toHaveLength(2);
    expect(pool.allTools).toHaveLength(4); // 2 tools per server
  });

  it('skips disabled servers', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'enabled-server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['a.js'],
          },
          {
            name: 'disabled-server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['b.js'],
            enabled: false,
          },
        ],
      },
    };

    const pool = await connectAll(config);
    expect(pool.connections).toHaveLength(1);
    expect(pool.allTools).toHaveLength(2);
  });

  it('continues when a server fails to connect', async () => {
    const originalImpl = vi.mocked(Client).getMockImplementation();
    vi.mocked(Client).mockImplementationOnce(() => {
      throw new Error('connection refused');
    });

    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'failing-server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['fail.js'],
          },
          {
            name: 'good-server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['good.js'],
          },
        ],
      },
    };

    const pool = await connectAll(config);
    expect(pool.connections).toHaveLength(1);
    expect(pool.connections[0].name).toBe('good-server');

    // Restore
    if (originalImpl) {
      vi.mocked(Client).mockImplementation(originalImpl);
    }
  });

  it('finds connection for tool by prefixed name', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'myserver',
            transport: 'stdio' as const,
            command: 'node',
            args: ['a.js'],
          },
        ],
      },
    };

    const pool = await connectAll(config);
    const conn = pool.getConnectionForTool('myserver__echo');
    expect(conn).toBeDefined();
    expect(conn?.name).toBe('myserver');
    expect(pool.getConnectionForTool('unknown__tool')).toBeUndefined();
  });

  it('buildRegisteredTools creates proper RegisteredTool entries', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'srv',
            transport: 'stdio' as const,
            command: 'node',
            args: ['a.js'],
          },
        ],
      },
    };

    const pool = await connectAll(config);
    const tools = buildRegisteredTools(pool);
    expect(tools).toHaveLength(2);

    const echoTool = tools.find((t) => t.name === 'srv__echo');
    expect(echoTool).toBeDefined();
    expect(echoTool?.source).toBe('mcp-client');
    expect(echoTool?.mcpServerName).toBe('srv');
    expect(echoTool?.mutates).toBe(true);
    expect(echoTool?.planModeAllowed).toBe(false);
    expect(echoTool?.description).toMatch(/\[MCP:srv\]/);

    const readTool = tools.find((t) => t.name === 'srv__read_data');
    expect(readTool).toBeDefined();
    expect(readTool?.mutates).toBe(false);
    expect(readTool?.planModeAllowed).toBe(true);
  });

  it('connectMcpClients returns pool and tools', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'test',
            transport: 'stdio' as const,
            command: 'node',
            args: ['a.js'],
          },
        ],
      },
    };

    const result = await connectMcpClients(config);
    expect(result.pool).toBeDefined();
    expect(result.tools).toHaveLength(2);
    expect(result.pool.connections).toHaveLength(1);
  });

  it('disconnectAll closes all connections', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      mcp: {
        allowWrite: false,
        port: 17321,
        servers: [
          {
            name: 'srv1',
            transport: 'stdio' as const,
            command: 'node',
            args: ['a.js'],
          },
          {
            name: 'srv2',
            transport: 'stdio' as const,
            command: 'node',
            args: ['b.js'],
          },
        ],
      },
    };

    const pool = await connectAll(config);
    await pool.disconnectAll();
    for (const conn of pool.connections) {
      expect(conn.client.close).toHaveBeenCalled();
    }
  });
});
