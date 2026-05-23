import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { loadMergedConfig } from '../config/load.js';
import { startEditorServer } from '../core/editor/server.js';
import { logger } from '../utils/logger.js';

const DEFAULT_PORT = 17323;

export async function runEditorServe(opts: GlobalOptions, portOverride?: number): Promise<void> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const port = portOverride ?? config.editor?.port ?? DEFAULT_PORT;

  const { port: bound, close } = await startEditorServer({
    projectRoot: root,
    port,
    host: '127.0.0.1',
  });

  const url = `http://127.0.0.1:${bound}/`;
  if (opts.json) {
    logger.json({ url, port: bound, project: root });
  } else {
    logger.info(chalk.green('✓'), `SparkCLI editor at ${chalk.cyan(url)}`);
    logger.info(chalk.dim('  Staging sync: GET/POST /api/staging'));
    logger.info(chalk.dim('  Press Ctrl+C to stop'));
  }

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      close();
      resolve();
    });
  });
}
