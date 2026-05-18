import chalk from 'chalk';
import { startMcpServer } from '../mcp/server.js';

export async function runMcpServe(): Promise<void> {
  if (process.env.SPARK_CLI_MCP_VERBOSE) {
    console.error(chalk.dim('[spark-cli] MCP server starting (stdio)...'));
  }
  await startMcpServer();
}
