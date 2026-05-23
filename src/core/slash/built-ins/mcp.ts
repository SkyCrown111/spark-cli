/**
 * MCP built-in command: /mcp (list, tools, add, remove, test).
 */

import chalk from 'chalk';
import { logger } from '../../../utils/logger.js';
import type { SlashCommand } from '../registry.js';
import { resolveProjectRoot } from '../../../utils/output.js';
import { loadMergedConfig } from '../../../config/load.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { builtin } from './types.js';

export function buildMcpCommands(): SlashCommand[] {
  return [
    builtin('mcp', 'MCP server management and status', async (args, { globalOpts }) => {
      const arg = args.trim().toLowerCase();
      const root = resolveProjectRoot(globalOpts);
      const config = await loadMergedConfig(root);
      const servers = config.mcp?.servers ?? [];

      if (arg === 'list' || arg === '' || arg === 'status') {
        if (servers.length === 0) {
          logger.info(chalk.dim('No MCP servers configured.'));
          logger.info(chalk.dim('Add servers in .spark/settings.json or .mcp.json'));
          return { kind: 'handled' };
        }
        logger.info(chalk.bold('MCP Servers:'));
        for (const s of servers) {
          const status = s.enabled === false ? chalk.red('disabled') : chalk.green('enabled');
          const transport = chalk.cyan(s.transport);
          const target =
            s.transport === 'stdio' ? (s.command ?? '(no command)') : (s.url ?? '(no url)');
          logger.info(`  ${chalk.bold(s.name)}  [${transport}]  ${status}`);
          logger.info(`    ${chalk.dim(target)}`);
        }
        return { kind: 'handled' };
      }

      if (arg === 'tools') {
        try {
          const { connectMcpClients } = await import('../../../mcp/client-pool.js');
          const { pool, tools } = await connectMcpClients(config, root);
          if (tools.length === 0) {
            logger.info(chalk.dim('No MCP tools discovered.'));
          } else {
            logger.info(chalk.bold(`MCP Tools (${tools.length}):`));
            for (const t of tools) {
              const ro = t.planModeAllowed ? chalk.dim(' (read-only)') : chalk.yellow(' (write)');
              logger.info(`  ${chalk.cyan(t.name)}${ro}`);
              if (t.description) {
                logger.info(`    ${chalk.dim(t.description.slice(0, 100))}`);
              }
            }
          }
          await pool.disconnectAll().catch(() => {});
        } catch (e) {
          logger.info(chalk.red(`Failed to connect: ${getErrorMessage(e)}`));
        }
        return { kind: 'handled' };
      }

      if (arg.startsWith('add ')) {
        const parts = arg.slice(4).trim().split(/\s+/);
        const name = parts[0];
        const command = parts[1];
        if (!name || !command) {
          logger.info(chalk.yellow('Usage: /mcp add <name> <command> [args...]'));
          return { kind: 'handled' };
        }
        const serverConfig: import('../../../config/schema.js').McpServerConfig = {
          name,
          transport: 'stdio',
          command,
          args: parts.slice(2),
          enabled: true,
        };
        const { writeProjectConfigYaml } = await import('../../../config/load.js');
        if (!config.mcp) config.mcp = {};
        if (!config.mcp.servers) config.mcp.servers = [];
        const existingIdx = config.mcp.servers.findIndex((s) => s.name === name);
        if (existingIdx >= 0) {
          config.mcp.servers[existingIdx] = serverConfig;
        } else {
          config.mcp.servers.push(serverConfig);
        }
        await writeProjectConfigYaml(root, config);
        logger.info(chalk.green(`Added MCP server "${name}" (${command}).`));
        return { kind: 'handled' };
      }

      if (arg.startsWith('remove ') || arg.startsWith('rm ')) {
        const name = (arg.startsWith('remove ') ? arg.slice(7) : arg.slice(3)).trim();
        if (!name) {
          logger.info(chalk.yellow('Usage: /mcp remove <name>'));
          return { kind: 'handled' };
        }
        const { writeProjectConfigYaml } = await import('../../../config/load.js');
        const servers = config.mcp?.servers ?? [];
        const idx = servers.findIndex((s) => s.name === name);
        if (idx < 0) {
          logger.info(chalk.red(`MCP server "${name}" not found.`));
          return { kind: 'handled' };
        }
        servers.splice(idx, 1);
        if (!config.mcp) config.mcp = {};
        config.mcp.servers = servers;
        await writeProjectConfigYaml(root, config);
        logger.info(chalk.green(`Removed MCP server "${name}".`));
        return { kind: 'handled' };
      }

      if (arg.startsWith('test ')) {
        const name = arg.slice(5).trim();
        if (!name) {
          logger.info(chalk.yellow('Usage: /mcp test <name>'));
          return { kind: 'handled' };
        }
        const server = servers.find((s) => s.name === name);
        if (!server) {
          logger.info(chalk.red(`MCP server "${name}" not found.`));
          return { kind: 'handled' };
        }
        logger.info(chalk.dim(`Connecting to "${name}" (${server.transport})...`));
        try {
          const { connectToServer, disconnectClient } = await import('../../../mcp/client.js');
          const conn = await connectToServer(server);
          logger.info(chalk.green(`Connected. ${conn.tools.length} tools discovered.`));
          await disconnectClient(conn);
        } catch (e) {
          logger.info(chalk.red(`Failed: ${getErrorMessage(e)}`));
        }
        return { kind: 'handled' };
      }

      logger.info(chalk.dim('Usage: /mcp [list|tools|add|remove|test]'));
      return { kind: 'handled' };
    }),
  ];
}
