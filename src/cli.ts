import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerAllCommands } from './commands/register.js';
import { exitWithError } from './utils/errors.js';
import { logger } from './utils/logger.js';
import type { GlobalOptions } from './utils/output.js';
import { runPrint } from './commands/print.js';
import { startBackgroundAgent } from './core/agent/background-agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program.version(pkg.version);

registerAllCommands(program);

async function main(): Promise<void> {
  // If --print/-p is specified, run non-interactive print mode immediately
  // before Commander parses subcommands. This avoids the REPL entry point.
  const argv = process.argv;
  const printIdx = argv.findIndex((a) => a === '-p' || a === '--print');
  if (printIdx !== -1 && printIdx + 1 < argv.length) {
    const prompt = argv[printIdx + 1];
    const isBg = argv.includes('--bg');
    // Parse the global flags manually for print mode
    const verbose = argv.includes('--verbose');
    const json = argv.includes('--json');
    if (verbose) logger.setLevel('debug');
    if (json) logger.setJsonMode(true);
    const globals: GlobalOptions = {
      project: findArgValue(argv, '-P', '--project') ?? process.cwd(),
      config: findArgValue(argv, '-c', '--config'),
      provider: findArgValue(argv, '--provider'),
      model: findArgValue(argv, '-m', '--model'),
      json,
      verbose,
      yes: argv.includes('-y') || argv.includes('--yes'),
      dryRun: argv.includes('--dry-run'),
      print: prompt,
      maxTurns: findArgValue(argv, '--max-turns')
        ? parseInt(findArgValue(argv, '--max-turns')!, 10)
        : undefined,
      maxBudgetUsd: findArgValue(argv, '--max-budget-usd')
        ? parseFloat(findArgValue(argv, '--max-budget-usd')!)
        : undefined,
      systemPrompt: findArgValue(argv, '--system-prompt'),
      appendSystemPrompt: findArgValue(argv, '--append-system-prompt'),
      effort: findArgValue(argv, '--effort') as GlobalOptions['effort'],
    };

    // --bg: spawn a detached background agent and return immediately
    if (isBg) {
      const { id } = await startBackgroundAgent({
        projectRoot: globals.project ?? process.cwd(),
        prompt,
        model: globals.model,
      });
      if (globals.json) {
        logger.json({ id, status: 'running' });
      } else {
        logger.info(`Background agent started: ${id}`);
      }
      return;
    }

    await runPrint(globals, prompt, {
      maxTurns: globals.maxTurns,
      maxBudgetUsd: globals.maxBudgetUsd,
      systemPrompt: globals.systemPrompt,
      appendSystemPrompt: globals.appendSystemPrompt,
    });
    return;
  }

  // `shell` is registered with `{ isDefault: true }` so bare `spark-cli` enters
  // the REPL. Do not call `program.parse([])` without a subcommand — Commander
  // prints help and exits before any action runs.
  await program.parseAsync(process.argv);
}

/** Find the value for a CLI argument that takes a value. */
function findArgValue(argv: string[], ...flags: string[]): string | undefined {
  for (const flag of flags) {
    const idx = argv.indexOf(flag);
    if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  }
  return undefined;
}

main().catch((err) => exitWithError(err));
