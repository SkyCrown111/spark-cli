import chalk from 'chalk';
import { startMcpServer } from '../mcp/server.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import {
  loadMergedConfig,
  saveGlobalConfig,
  loadGlobalConfig,
  writeProjectConfigYaml,
} from '../config/load.js';
import type { McpServerConfig, SparkCLIConfig } from '../config/schema.js';
import { connectToServer, disconnectClient } from '../mcp/client.js';
import { getErrorMessage } from '../utils/errors.js';

export async function runMcpServe(): Promise<void> {
  if (process.env.SPARK_CLI_MCP_VERBOSE) {
    logger.debug(chalk.dim('[spark-cli] MCP server starting (stdio)...'));
  }
  await startMcpServer();
}

interface McpAddOptions {
  transport?: 'stdio' | 'sse';
  command?: string;
  args?: string;
  url?: string;
  env?: string;
  global?: boolean;
}

/**
 * `mcp add <name> --transport stdio --command <cmd> [--args <args>]`
 * Adds a new MCP server to the config.
 */
export async function runMcpAdd(
  globalOpts: GlobalOptions,
  name: string,
  opts: McpAddOptions,
): Promise<void> {
  const transport = opts.transport ?? 'stdio';
  const root = resolveProjectRoot(globalOpts);

  if (transport === 'stdio' && !opts.command) {
    logger.error(chalk.red('Error: --command is required for stdio transport.'));
    process.exitCode = 1;
    return;
  }
  if (transport === 'sse' && !opts.url) {
    logger.error(chalk.red('Error: --url is required for sse transport.'));
    process.exitCode = 1;
    return;
  }

  const serverConfig: McpServerConfig = {
    name,
    transport,
    command: opts.command,
    args: opts.args ? opts.args.split(/\s+/) : undefined,
    url: opts.url,
    env: opts.env ? parseEnvString(opts.env) : undefined,
    enabled: true,
  };

  if (opts.global) {
    const config = loadGlobalConfig();
    addServerToConfig(config, serverConfig);
    saveGlobalConfig(config);
    logger.info(chalk.green(`Added MCP server "${name}" to global config.`));
  } else {
    const config = await loadMergedConfig(root);
    addServerToConfig(config, serverConfig);
    writeProjectConfigYaml(root, config);
    logger.info(chalk.green(`Added MCP server "${name}" to project config.`));
  }
}

/**
 * `mcp list`
 * Lists all configured MCP servers.
 */
export async function runMcpList(globalOpts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(globalOpts);
  const config = await loadMergedConfig(root);
  const servers = config.mcp?.servers ?? [];

  if (servers.length === 0) {
    logger.info(chalk.dim('No MCP servers configured.'));
    logger.info(
      chalk.dim('Add one with: spark-cli mcp add <name> --transport stdio --command <cmd>'),
    );
    return;
  }

  logger.info(chalk.bold('Configured MCP servers:\n'));
  for (const s of servers) {
    const status = s.enabled === false ? chalk.red('disabled') : chalk.green('enabled');
    const transport = chalk.cyan(s.transport);
    const target =
      s.transport === 'stdio'
        ? `${s.command}${s.args ? ' ' + s.args.join(' ') : ''}`
        : (s.url ?? '(no url)');
    logger.info(`  ${chalk.bold(s.name)}  [${transport}]  ${status}`);
    logger.info(`    ${chalk.dim(target)}`);
  }
}

interface McpRemoveOpts {
  global?: boolean;
}

/**
 * `mcp remove <name>`
 * Removes an MCP server from the config.
 */
export async function runMcpRemove(
  globalOpts: GlobalOptions,
  name: string,
  opts: McpRemoveOpts,
): Promise<void> {
  const root = resolveProjectRoot(globalOpts);

  if (opts.global) {
    const config = loadGlobalConfig();
    if (!removeServerFromConfig(config, name)) {
      logger.error(chalk.red(`MCP server "${name}" not found in global config.`));
      process.exitCode = 1;
      return;
    }
    saveGlobalConfig(config);
    logger.info(chalk.green(`Removed MCP server "${name}" from global config.`));
  } else {
    const config = await loadMergedConfig(root);
    if (!removeServerFromConfig(config, name)) {
      logger.error(chalk.red(`MCP server "${name}" not found in project config.`));
      process.exitCode = 1;
      return;
    }
    writeProjectConfigYaml(root, config);
    logger.info(chalk.green(`Removed MCP server "${name}" from project config.`));
  }
}

/**
 * `mcp test <name>`
 * Tests connectivity to a configured MCP server.
 */
export async function runMcpTest(globalOpts: GlobalOptions, name: string): Promise<void> {
  const root = resolveProjectRoot(globalOpts);
  const config = await loadMergedConfig(root);
  const servers = config.mcp?.servers ?? [];
  const server = servers.find((s) => s.name === name);

  if (!server) {
    logger.error(chalk.red(`MCP server "${name}" not found in config.`));
    process.exitCode = 1;
    return;
  }

  logger.info(chalk.dim(`Connecting to MCP server "${name}" (${server.transport})...`));
  try {
    const conn = await connectToServer(server);
    logger.info(chalk.green(`Connected successfully.`));
    logger.info(chalk.dim(`  Tools discovered: ${conn.tools.length}`));
    for (const tool of conn.tools) {
      const ro = tool.readOnly ? chalk.dim(' (read-only)') : chalk.yellow(' (write)');
      logger.info(`    - ${tool.prefixedName}${ro}: ${tool.description.slice(0, 80)}`);
    }
    await disconnectClient(conn);
  } catch (e) {
    logger.error(chalk.red(`Connection failed: ${getErrorMessage(e)}`));
    process.exitCode = 1;
  }
}

// ── Helpers ──

function addServerToConfig(config: SparkCLIConfig, server: McpServerConfig): void {
  if (!config.mcp) config.mcp = {};
  if (!config.mcp.servers) config.mcp.servers = [];
  // Replace if same name exists
  const idx = config.mcp.servers.findIndex((s) => s.name === server.name);
  if (idx >= 0) {
    config.mcp.servers[idx] = server;
  } else {
    config.mcp.servers.push(server);
  }
}

function removeServerFromConfig(config: SparkCLIConfig, name: string): boolean {
  const servers = config.mcp?.servers;
  if (!servers) return false;
  const idx = servers.findIndex((s) => s.name === name);
  if (idx < 0) return false;
  servers.splice(idx, 1);
  return true;
}

function parseEnvString(envStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of envStr.split(',')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) result[key] = rest.join('=');
  }
  return result;
}
