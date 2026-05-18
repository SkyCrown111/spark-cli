/**
 * Build the agent system prompt.
 *
 * Sections (in order):
 *   1. Identity + capability statement
 *   2. Project context (engine, scenes, scripts) — cached per session
 *   3. Memory block (project + session)
 *   4. Knowledge hits (BM25 over knowledge/*.md)
 *   5. Tool-use preamble (when to call tools, write-mode rules, plan mode)
 *
 * The cached project context is the optimization: the previous codepath
 * re-scanned every turn. We scan once per agent session; `read_file` / `glob`
 * / `grep` give the model fresh views on demand. Refresh manually via
 * `refreshProjectContext()`.
 */

import {
  scanProjectContext,
  formatContextForPrompt,
  type ProjectContext,
} from '../context/project-scanner.js';
import { formatMemoryForPrompt } from '../memory/store.js';
import { readMemoryIndex } from '../memory/cross-session-store.js';
import { loadIndex } from '../knowledge/indexer.js';
import { searchKnowledge } from '../knowledge/retriever.js';
import type { ToolWriteMode, ToolRunMode } from './tool-registry.js';
import type { SkillRegistry } from '../skills/registry.js';

const MAX_SKILL_BYTES = 16 * 1024;

const contextCache = new Map<string, ProjectContext>();

export function getCachedProjectContext(projectRoot: string): ProjectContext {
  const cached = contextCache.get(projectRoot);
  if (cached) return cached;
  const ctx = scanProjectContext(projectRoot);
  contextCache.set(projectRoot, ctx);
  return ctx;
}

export function refreshProjectContext(projectRoot: string): ProjectContext {
  contextCache.delete(projectRoot);
  return getCachedProjectContext(projectRoot);
}

function toolPreamble(mode: ToolRunMode, writeMode: ToolWriteMode): string {
  const planRules =
    mode === 'plan'
      ? `
PLAN MODE ENGAGED — read-only.
- Tools available: read_file, list_dir, glob, grep, and any read-only MCP tools.
- DO NOT call write_file, edit_file, or bash. They will be refused.
- When you have enough understanding, summarize your plan in plain prose. The
  user will review and use /exit-plan to approve. Do not write files yourself.
`
      : '';

  const writeRules =
    writeMode === 'staging'
      ? `Write-mode: STAGING (default).
- write_file / edit_file route to .spark-cli/staging/. Nothing touches the
  project until the user runs /apply.
- Mention to the user that they can /diff to inspect and /apply to commit.`
      : `Write-mode: DIRECT (--auto / /auto).
- write_file / edit_file land directly in the project tree. Be deliberate.
- Each direct write is recorded in replay log; /revert is unavailable in this
  mode (use git or backups).`;

  return `## Tool use

You have access to tools. When a question requires inspecting the project or
making changes, CALL THE TOOL — do not ask the user to read files for you.

Order of preference:
1. list_dir, glob — discover structure quickly.
2. read_file — read a specific path. Pass offset/limit for large files.
3. grep — find patterns across the tree.
4. write_file — create new files. edit_file — modify existing ones.
5. bash — last resort for build/test commands. 30s timeout.

Tool-result loop:
- After every tool call, you will receive its output as a tool message. Decide
  whether you need more tool calls or whether you have enough to answer.
- If a tool returned an error, fix the error and call again — do not give up
  after one failure.
- When done, reply in prose. Do not narrate "I will now call X" before the call;
  just call it.

${writeRules}
${planRules}`.trim();
}

export interface SystemPromptOpts {
  projectRoot: string;
  writeMode: ToolWriteMode;
  mode: ToolRunMode;
  userInputForKnowledgeRetrieval?: string;
  /** When provided, trigger-matched skills are inlined into the prompt. */
  skills?: SkillRegistry;
}

export function buildAgentSystemPrompt(opts: SystemPromptOpts): string {
  const ctx = getCachedProjectContext(opts.projectRoot);
  const sections: string[] = [];

  sections.push(
    `You are SparkCLI, an interactive AI engineer for game projects (Cocos Creator, Unity, Unreal, Godot, WeChat / Douyin / Alipay / Huawei minigames). You collaborate with the user from a terminal REPL with full filesystem access via tools.`,
  );

  sections.push(formatContextForPrompt(ctx));

  const memoryBlock = formatMemoryForPrompt(opts.projectRoot);
  if (memoryBlock) sections.push(memoryBlock);

  const crossSessionIndex = readMemoryIndex(opts.projectRoot).trim();
  if (crossSessionIndex) {
    sections.push(
      [
        '## Cross-session memory (index)',
        'Saved facts from prior sessions. Use memory_search / memory_save / memory_delete to read or maintain them. Verify load-bearing claims before acting.',
        '',
        crossSessionIndex,
      ].join('\n'),
    );
  }

  if (opts.userInputForKnowledgeRetrieval) {
    const index = loadIndex(opts.projectRoot);
    if (index) {
      const hits = searchKnowledge(index, opts.userInputForKnowledgeRetrieval, 3);
      if (hits.length) {
        const lines = ['## Knowledge (retrieved)'];
        for (const h of hits) {
          lines.push(`### ${h.chunk.title}\n${h.chunk.text.slice(0, 600)}`);
        }
        sections.push(lines.join('\n'));
      }
    }
  }

  // Skills auto-injection: scan triggers in user input, inline matched bodies
  // until the byte budget is exhausted.
  if (opts.skills && opts.userInputForKnowledgeRetrieval) {
    const matched = opts.skills.findByTrigger(
      opts.userInputForKnowledgeRetrieval,
    );
    if (matched.length > 0) {
      const lines = ['## Loaded skills'];
      let used = 0;
      for (const s of matched) {
        const header = `### ${s.name}${s.description ? ` — ${s.description}` : ''}`;
        const block = `${header}\n${s.body}`;
        const cost = Buffer.byteLength(block, 'utf8');
        if (used + cost > MAX_SKILL_BYTES) {
          lines.push(`(${matched.length - lines.length + 1} more skills omitted; budget reached)`);
          break;
        }
        lines.push(block);
        used += cost;
      }
      sections.push(lines.join('\n\n'));
    }
  }

  sections.push(toolPreamble(opts.mode, opts.writeMode));

  return sections.join('\n\n');
}

/** Test-only: clear the cache between unit tests. */
export function _resetSystemPromptForTests(): void {
  contextCache.clear();
}
