export interface SparkCLIPluginManifest {
  name: string;
  version: string;
  description?: string;
  engines?: string[];
  main?: string;
  /** Hooks this plugin wants to handle. */
  hooks?: PluginHookDef[];
  /** MCP servers provided by this plugin. */
  mcpServers?: PluginMcpServer[];
}

export interface PluginHookDef {
  /** Event name to handle (e.g. 'on_skill_load', 'on_compaction'). */
  event: string;
  /** Command to execute when the hook fires. */
  command?: string;
  /** Script to execute (relative to plugin dir). */
  script?: string;
  /** Whether this hook blocks execution until complete. */
  blocking?: boolean;
}

export interface PluginMcpServer {
  /** Name for this MCP server. */
  name: string;
  /** Transport type. */
  transport: 'stdio';
  /** Command to start the server. */
  command: string;
  /** Arguments for the command. */
  args?: string[];
  /** Environment variables. */
  env?: Record<string, string>;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  path: string;
  description?: string;
  engines?: string[];
  hooks?: PluginHookDef[];
  mcpServers?: PluginMcpServer[];
}
