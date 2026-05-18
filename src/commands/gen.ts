import chalk from 'chalk';
import { runAgentTaskPrompt } from '../core/agent/run-task.js';
import { buildGenAgentPrompt } from '../core/agent/task-prompts.js';
import { resolveProjectRoot } from '../utils/output.js';
import { scanProjectContext } from '../core/context/project-scanner.js';
import { stageGodotTemplateGen } from '../engines/godot/template-gen.js';
import { stageUnrealTemplateGen } from '../engines/unreal/template-gen.js';
import { appendReplayEvent } from '../core/replay/log.js';
import type { GlobalOptions } from '../utils/output.js';

export async function runGen(
  opts: GlobalOptions,
  prompt: string,
  type?: string,
  template?: boolean,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const ctx = scanProjectContext(root);

  if (template || ctx.engine === 'godot' || ctx.engine === 'unreal') {
    if (ctx.engine === 'godot') {
      const { files } = stageGodotTemplateGen(root, prompt || 'sample component');
      appendReplayEvent(root, 'command', { cmd: 'gen.template', engine: 'godot', files });
      if (opts.json) {
        console.log(JSON.stringify({ template: true, engine: 'godot', files }));
      } else {
        console.log(chalk.green('✓'), `Staged ${files.length} file(s) (Godot template):`);
        for (const f of files) console.log(chalk.cyan(' ', f));
      }
      return;
    }
    if (ctx.engine === 'unreal') {
      const { files } = stageUnrealTemplateGen(root, prompt || 'sample actor');
      appendReplayEvent(root, 'command', { cmd: 'gen.template', engine: 'unreal', files });
      if (opts.json) {
        console.log(JSON.stringify({ template: true, engine: 'unreal', files }));
      } else {
        console.log(chalk.green('✓'), `Staged ${files.length} file(s) (Unreal template):`);
        for (const f of files) console.log(chalk.cyan(' ', f));
      }
      return;
    }
  }

  await runAgentTaskPrompt(opts, buildGenAgentPrompt(prompt, type));
}
