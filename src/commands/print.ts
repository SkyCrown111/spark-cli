/**
 * `spark-cli -p <prompt>` — non-interactive print/one-shot mode.
 *
 * Runs a single agent turn with the prompt and exits, printing the result.
 * Supports pipe input (`cat file | spark-cli -p "explain"`), turn/budget
 * limits, and custom system prompts.
 */

import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { readStdinPipe } from '../utils/stdin.js';
import { runAgentTurnForCli } from '../core/agent/run-turn.js';
import type { ToolWriteMode } from '../core/agent/tool-registry.js';
import { createAgentRegistry } from '../core/agents/registry.js';
import { loadAgentsFromDisk } from '../core/agents/loader.js';

export interface PrintOptions {
  /** Direct-write to project tree instead of staging. */
  auto?: boolean;
  /** Maximum agent iterations. */
  maxTurns?: number;
  /** Maximum dollar spend (estimated). */
  maxBudgetUsd?: number;
  /** Custom system prompt (replaces default). */
  systemPrompt?: string;
  /** Append to default system prompt. */
  appendSystemPrompt?: string;
}

export async function runPrint(
  opts: GlobalOptions,
  prompt: string,
  printOpts: PrintOptions = {},
): Promise<void> {
  const writeMode: ToolWriteMode = printOpts.auto ? 'direct' : 'staging';

  // Merge pipe input with prompt if stdin is piped
  const piped = await readStdinPipe();
  const fullPrompt = piped ? `${piped}\n\n---\nUser prompt: ${prompt}` : prompt;

  // Resolve active agent
  let agentSystemAppend: string | undefined;
  let agentAllowedTools: Set<string> | undefined;
  if (opts.agent) {
    const root = resolveProjectRoot(opts);
    const agentReg = createAgentRegistry();
    loadAgentsFromDisk(agentReg, root);
    const agentDef = agentReg.get(opts.agent);
    if (agentDef) {
      agentSystemAppend = agentDef.systemPrompt;
      if (agentDef.allowedTools) {
        agentAllowedTools = new Set(agentDef.allowedTools);
      }
    } else {
      logger.warn(chalk.yellow(`Agent "${opts.agent}" not found, using default.`));
    }
  }

  // Merge agent system prompt with any user-provided append
  const mergedAppend =
    [printOpts.appendSystemPrompt, agentSystemAppend].filter(Boolean).join('\n\n') || undefined;

  const result = await runAgentTurnForCli({
    globalOpts: opts,
    history: [],
    userInput: fullPrompt,
    writeMode,
    mode: 'normal',
    agentId: `print-${Date.now()}`,
    maxTurns: printOpts.maxTurns,
    maxBudgetUsd: printOpts.maxBudgetUsd,
    systemPromptOverride: printOpts.systemPrompt,
    appendSystemPrompt: mergedAppend,
    agentAllowedTools,
    onIteration: () => {
      // Silent in print mode — no spinner
    },
  });

  if (opts.json) {
    logger.json({
      model: result.model,
      stopReason: result.stopReason,
      iterations: result.iterations,
      content: result.finalContent,
      toolCalls: result.toolCalls.map((c) => ({
        tool: c.tool,
        isError: c.result.isError ?? false,
        durationMs: c.durationMs,
      })),
      usage: result.usage,
    });
    return;
  }

  // Plain text output
  if (result.finalContent) {
    logger.info(result.finalContent);
  }
  if (result.toolCalls.length > 0) {
    const ok = result.toolCalls.filter((c) => !c.result.isError).length;
    const err = result.toolCalls.length - ok;
    const summary = err > 0 ? `${ok} ok, ${err} error${err > 1 ? 's' : ''}` : `${ok} ok`;
    logger.info(
      chalk.dim(
        `  ${result.toolCalls.length} tool call(s) (${summary}) · ${result.iterations} iteration(s) · model ${result.model}`,
      ),
    );
  }
  if (result.stopReason === 'iteration_cap') {
    logger.info(
      chalk.yellow(
        `⚠ Reached iteration cap (${result.iterations}). Re-run with --max-turns to increase.`,
      ),
    );
  }
  if (result.stopReason === 'budget_cap') {
    logger.info(chalk.yellow(`⚠ Budget cap reached. Re-run with --max-budget-usd to increase.`));
  }
}
