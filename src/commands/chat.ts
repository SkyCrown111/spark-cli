/**
 * `spark-cli chat <prompt>` — one-shot conversational with tools.
 *
 * Routes through the ReAct agent loop. The legacy codegen pipeline was removed
 * in 0.2.0; consumers that parsed fenced code blocks should switch to the
 * staging diff produced by the agent (see `spark-cli diff`).
 *
 * `spark-cli chat` (no prompt) keeps falling through to `runShell` — that wiring
 * lives in `cli.ts`.
 */

import ora from 'ora';
import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { logger } from '../utils/logger.js';
import { runAgentTurnForCli } from '../core/agent/run-turn.js';
import type { ToolWriteMode } from '../core/agent/tool-registry.js';
import { createAgentRegistry } from '../core/agents/registry.js';
import { loadAgentsFromDisk } from '../core/agents/loader.js';

export interface ChatOptions {
  /** Direct-write to project tree instead of staging. */
  auto?: boolean;
}

export async function runChat(
  opts: GlobalOptions,
  prompt: string,
  chatOpts: ChatOptions = {},
): Promise<void> {
  const writeMode: ToolWriteMode = chatOpts.auto ? 'direct' : 'staging';
  const spinner = ora({
    text: 'Thinking...',
    isEnabled: !opts.json,
  }).start();

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

  let dotCount = 0;
  const result = await runAgentTurnForCli({
    globalOpts: opts,
    history: [],
    userInput: prompt,
    writeMode,
    mode: 'normal',
    agentId: `chat-${Date.now()}`,
    appendSystemPrompt: agentSystemAppend,
    agentAllowedTools,
    onIteration: (info) => {
      if (info.dispatched && info.dispatched.length > 0) {
        const names = info.dispatched.map((d) => d.tool).join(', ');
        spinner.text = `iter ${info.iteration}: ${names} (${++dotCount} step${dotCount > 1 ? 's' : ''})`;
      }
    },
  }).catch((e) => {
    spinner.fail('Request failed');
    throw e;
  });
  spinner.stop();

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

  if (result.finalContent) {
    logger.info('\n' + result.finalContent + '\n');
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
    logger.warn(
      chalk.yellow(
        `⚠ Reached iteration cap (${result.iterations}). Re-run with a more focused prompt or raise the cap.`,
      ),
    );
  }
}
