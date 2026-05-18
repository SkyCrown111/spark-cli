/**
 * Build a tool registry pre-loaded with the built-in agent tools and the
 * engine-appropriate MCP-adapted tools. Used by the agent loop and tests.
 */

import type { SparkCLIConfig } from '../../../config/schema.js';
import { createToolRegistry, type ToolRegistry } from '../tool-registry.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { loadSkillTool } from './load-skill.js';
import { taskTool } from './task.js';
import { rememberTool, recallTool } from './memory.js';
import { askUserQuestionTool } from './ask-user-question.js';
import { bashBackgroundTool } from './bash-background.js';
import { taskOutputTool } from './task-output.js';
import { taskStopTool } from './task-stop.js';
import { webFetchTool, webSearchTool } from './web.js';
import { todoCreateTool, todoListTool, todoGetTool, todoUpdateTool } from './todo.js';
import {
  memorySaveTool,
  memorySearchTool,
  memoryListTool,
  memoryDeleteTool,
} from './memory-cross-session.js';
import { buildMcpAdaptedTools } from './mcp-adapter.js';
import { buildEditorBridgeTools } from './editor-bridge.js';
import { buildPhase14Tools } from './phase14.js';

export function buildDefaultRegistry(opts: {
  projectRoot: string;
  config: SparkCLIConfig;
  includeMcp?: boolean;
}): ToolRegistry {
  const reg = createToolRegistry();
  reg.register(readFileTool);
  reg.register(writeFileTool);
  reg.register(editFileTool);
  reg.register(bashTool);
  reg.register(globTool);
  reg.register(grepTool);
  reg.register(listDirTool);
  reg.register(loadSkillTool);
  reg.register(taskTool);
  reg.register(rememberTool);
  reg.register(recallTool);
  reg.register(askUserQuestionTool);
  reg.register(bashBackgroundTool);
  reg.register(taskOutputTool);
  reg.register(taskStopTool);
  reg.register(webFetchTool);
  reg.register(webSearchTool);
  reg.register(todoCreateTool);
  reg.register(todoListTool);
  reg.register(todoGetTool);
  reg.register(todoUpdateTool);
  reg.register(memorySaveTool);
  reg.register(memorySearchTool);
  reg.register(memoryListTool);
  reg.register(memoryDeleteTool);

  if (opts.includeMcp ?? true) {
    for (const t of buildMcpAdaptedTools(opts.projectRoot, opts.config)) {
      if (reg.has(t.name)) continue;
      reg.register(t);
    }
  }

  for (const t of buildEditorBridgeTools(opts.projectRoot, opts.config)) {
    if (reg.has(t.name)) continue;
    reg.register(t);
  }

  for (const t of buildPhase14Tools()) {
    if (reg.has(t.name)) continue;
    reg.register(t);
  }

  return reg;
}

export {
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  loadSkillTool,
  taskTool,
  rememberTool,
  recallTool,
  askUserQuestionTool,
  bashBackgroundTool,
  taskOutputTool,
  taskStopTool,
  webFetchTool,
  webSearchTool,
  todoCreateTool,
  todoListTool,
  todoGetTool,
  todoUpdateTool,
  memorySaveTool,
  memorySearchTool,
  memoryListTool,
  memoryDeleteTool,
};
