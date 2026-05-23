/**
 * Slash command registry.
 *
 * - Built-ins (`/help`, `/exit`, `/auto`, `/clear`, `/diff`, …) plus user-defined
 *   commands loaded from `.spark/commands/*.md` (project) and
 *   `~/.spark/commands/*.md` (user), with legacy `.spark-cli` fallback.
 *   Project wins on name collisions.
 * - File-based commands are NOT synchronous JS handlers — they expand to a
 *   user-prompt string the agent loop runs as the next turn (see
 *   `loader.ts`'s `body` field). The dispatcher decides whether a command
 *   short-circuits the REPL or queues a synthetic user message.
 *
 * Phase 5 introduces this module; Phase 6/7 register hooks/skill commands here.
 */

import type { GlobalOptions } from '../../utils/output.js';

export type SlashOutcome =
  /** Command handled itself; REPL shows next prompt. */
  | { kind: 'handled' }
  /** Inject a synthetic user message and run a turn (file-based commands). */
  | { kind: 'prompt'; text: string; mode?: 'normal' | 'plan' | 'auto' }
  /** Exit the REPL gracefully. */
  | { kind: 'exit' }
  /** Switch the REPL into plan mode for subsequent turns. */
  | { kind: 'enter-plan' }
  /** Exit plan mode after rendering the model's plan; ask user to approve. */
  | { kind: 'exit-plan'; approve: boolean };

export interface SlashContext {
  globalOpts: GlobalOptions;
  /** Args after the command name, joined into a single string. */
  args: string;
  /** Raw line including the leading slash, for diagnostics. */
  raw: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  /** Optional usage hint shown by `/help`. */
  usage?: string;
  /** Provenance, mostly for `/help` rendering. */
  source: 'builtin' | 'project' | 'user';
  /** When loaded from a markdown file, the body becomes a synthetic prompt. */
  body?: string;
  /** From frontmatter: tools the agent is allowed to call for this turn. */
  allowedTools?: string[];
  /** From frontmatter: 'plan' enters plan mode for this turn only. */
  mode?: 'normal' | 'plan' | 'auto';
  /** Synchronous handler for built-ins. */
  handler?: (ctx: SlashContext) => Promise<SlashOutcome>;
}

export interface SlashRegistry {
  register(cmd: SlashCommand): void;
  list(): SlashCommand[];
  get(name: string): SlashCommand | undefined;
  /**
   * Dispatch a `/...` line. Returns `{ kind: 'unknown' }` if no command
   * matches; the caller treats unknown slashes as plain prose.
   */
  dispatch(line: string, globalOpts: GlobalOptions): Promise<SlashOutcome | { kind: 'unknown' }>;
}

export function createSlashRegistry(): SlashRegistry {
  const cmds = new Map<string, SlashCommand>();

  return {
    register(cmd) {
      cmds.set(cmd.name.toLowerCase(), cmd);
    },
    list() {
      return [...cmds.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    get(name) {
      return cmds.get(name.toLowerCase());
    },
    async dispatch(line, globalOpts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('/')) return { kind: 'unknown' };
      const space = trimmed.indexOf(' ');
      const head = (space === -1 ? trimmed : trimmed.slice(0, space)).slice(1).toLowerCase();
      const args = space === -1 ? '' : trimmed.slice(space + 1).trim();

      const cmd = cmds.get(head);
      if (!cmd) return { kind: 'unknown' };

      const ctx: SlashContext = { globalOpts, args, raw: trimmed };

      if (cmd.handler) {
        return cmd.handler(ctx);
      }

      // File-based command: expand body, optionally substituting $ARGUMENTS.
      const text = (cmd.body ?? '').replace(/\$ARGUMENTS/g, args);
      return { kind: 'prompt', text, mode: cmd.mode };
    },
  };
}
