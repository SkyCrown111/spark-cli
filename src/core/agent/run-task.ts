import type { GlobalOptions } from '../../utils/output.js';
import { runAgentTurnForCli, type RunTurnOptions } from './run-turn.js';
import type { ToolWriteMode } from './tool-registry.js';
import type { VisualInputContext } from '../vision/visual-context.js';

export interface AgentTaskOptions {
  writeMode?: ToolWriteMode;
  visualContext?: VisualInputContext;
}

export async function runAgentTaskPrompt(
  opts: GlobalOptions,
  userInput: string,
  taskOpts: AgentTaskOptions = {},
): Promise<void> {
  const turnOpts: RunTurnOptions = {
    globalOpts: opts,
    history: [],
    userInput,
    writeMode: taskOpts.writeMode ?? 'staging',
    mode: 'normal',
    agentId: `task-${Date.now()}`,
    visualContext: taskOpts.visualContext,
    expandAtRefs: false,
  };

  const result = await runAgentTurnForCli(turnOpts);

  if (opts.json) {
    console.log(
      JSON.stringify({
        model: result.model,
        content: result.finalContent,
        iterations: result.iterations,
        toolCalls: result.toolCalls.map((c) => c.tool),
      }),
    );
    return;
  }

  if (result.finalContent) {
    console.log('\n' + result.finalContent + '\n');
  }
}
