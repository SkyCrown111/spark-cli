/**
 * Build the agent system prompt.
 *
 * Sections (in order):
 *   1. Identity + capability statement
 *   2. Project context (engine, scenes, scripts) — cached per session
 *   3. Memory block (project + session)
 *   4. Knowledge hits (BM25 over knowledge/*.md)
 *   5. Skills index + trigger-inlined bodies (when registry present)
 *   6. Tool-use preamble (when to call tools, write-mode rules, plan mode)
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
import { readMemoryIndex, listMemories } from '../memory/cross-session-store.js';
import { selectRelevantMemories, formatRelevantMemoriesForPrompt } from '../memory/relevance.js';
import { loadIndex } from '../knowledge/indexer.js';
import { searchKnowledge } from '../knowledge/retriever.js';
import {
  getCachedProjectInstructions,
  formatInstructionsForPrompt,
} from '../instructions/loader.js';
import type { ToolWriteMode, ToolRunMode } from './tool-registry.js';
import type { SkillRegistry } from '../skills/registry.js';

const MAX_SKILL_BYTES = 16 * 1024;
const MAX_SKILL_INDEX_LINES = 48;

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
- Tools available: read_file, list_dir, glob, grep, load_skill, and any read-only MCP tools.
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
4. load_skill — load a named skill (see **Skills (index)** when present in this prompt).
5. write_file — create new files. edit_file — modify existing ones.
6. bash — last resort for build/test commands. 30s timeout.

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
  /** Reasoning effort level for this turn. */
  effortLevel?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export function buildAgentSystemPrompt(opts: SystemPromptOpts): string {
  const ctx = getCachedProjectContext(opts.projectRoot);
  const sections: string[] = [];

  sections.push(
    `You are SparkCLI, an interactive AI engineer for game projects (Cocos Creator, Unity, Unreal, Godot, WeChat / Douyin / Alipay / Huawei minigames). You collaborate with the user from a terminal REPL with full filesystem access via tools.`,
  );

  sections.push(formatContextForPrompt(ctx));

  // Auto-loaded project instructions (SPARKCLI.md)
  const instructions = getCachedProjectInstructions(opts.projectRoot);
  const instructionsBlock = formatInstructionsForPrompt(instructions);
  if (instructionsBlock) sections.push(instructionsBlock);

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

  // Load top-N relevant memory bodies matching the current topic
  if (opts.userInputForKnowledgeRetrieval) {
    const allMemories = listMemories(opts.projectRoot);
    if (allMemories.length > 0) {
      const relevant = selectRelevantMemories(
        allMemories,
        opts.userInputForKnowledgeRetrieval,
        3,
      );
      if (relevant.length > 0) {
        const block = formatRelevantMemoriesForPrompt(relevant);
        if (block) sections.push(block);
      }
    }
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

  if (opts.skills) {
    const catalog = opts.skills.list();
    if (catalog.length > 0) {
      const lines = [
        '## Skills (index)',
        'Playbooks may be bundled with SparkCLI, installed under `~/.spark-cli/skills/`, or in `.spark-cli/skills/`. Later layers override the same skill name.',
        'Call **`load_skill`** with `{ "name": "<skill>" }` to pull the full body. Matching **triggers** may auto-inline excerpts in a later section.',
        '',
      ];
      for (const s of catalog.slice(0, MAX_SKILL_INDEX_LINES)) {
        const desc = s.description ? ` — ${s.description}` : '';
        const trigHint =
          s.triggers.length > 0
            ? ` _(triggers: ${s.triggers.slice(0, 5).join(', ')}${s.triggers.length > 5 ? ', …' : ''})_`
            : '';
        lines.push(`- **${s.name}**${desc}${trigHint}`);
      }
      if (catalog.length > MAX_SKILL_INDEX_LINES) {
        lines.push(
          `- _…and ${catalog.length - MAX_SKILL_INDEX_LINES} more (run \`/skills\` or \`spark-cli skills list\`)_`,
        );
      }
      sections.push(lines.join('\n'));
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

  // Effort level annotation
  if (opts.effortLevel && opts.effortLevel !== 'medium') {
    const effortNote = opts.effortLevel === 'low'
      ? 'Reasoning effort: LOW — be brief, skip lengthy explanations, prioritize speed.'
      : opts.effortLevel === 'high' || opts.effortLevel === 'xhigh'
        ? `Reasoning effort: ${opts.effortLevel.toUpperCase()} — think carefully, verify assumptions, consider edge cases before responding.`
        : opts.effortLevel === 'max'
          ? 'Reasoning effort: MAX — provide the most thorough analysis possible. Consider all alternatives, document reasoning, double-check every claim.'
          : '';
    if (effortNote) sections.push(effortNote);
  }

  return sections.join('\n\n');
}

/** Test-only: clear the cache between unit tests. */
export function _resetSystemPromptForTests(): void {
  contextCache.clear();
}
