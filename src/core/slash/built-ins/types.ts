/**
 * Shared types and helpers for built-in slash commands.
 */

import type { SlashCommand, SlashOutcome } from '../registry.js';

/**
 * Sentinel outcomes for REPL-internal state. The REPL recognizes these by
 * `kind` and translates them into state mutations. They live in this file so
 * the registry stays decoupled from `shell.ts`.
 */
export type StatefulOutcome =
  | { kind: 'state-clear-history' }
  | { kind: 'state-set-write-mode'; writeMode: 'staging' | 'direct' | 'toggle' }
  | { kind: 'state-show-status' }
  | { kind: 'state-compact-history' }
  | { kind: 'state-show-model-picker' }
  | { kind: 'state-show-theme-picker' }
  | { kind: 'state-set-effort'; effortLevel: import('../../../state/AppState.js').EffortLevel }
  | { kind: 'state-resume-session'; sessionId?: string }
  | { kind: 'state-show-session-picker' }
  | { kind: 'state-export-session'; filename?: string }
  | { kind: 'state-branch-session'; name?: string }
  | { kind: 'state-rename-session'; name: string }
  // Phase 2: new stateful outcomes
  | { kind: 'state-set-goal'; condition?: string }
  | { kind: 'state-clear-goal' }
  | { kind: 'state-copy-replies'; count?: number }
  | { kind: 'state-show-context'; all?: boolean }
  | { kind: 'state-add-dir'; path: string }
  | { kind: 'state-toggle-sandbox' }
  | { kind: 'state-toggle-focus' }
  | { kind: 'state-scan-permissions' }
  | { kind: 'state-toggle-debug'; description?: string }
  | { kind: 'state-show-keybindings' }
  | { kind: 'state-show-agents' }
  | { kind: 'state-set-agent'; agentName?: string }
  | { kind: 'state-set-renderer'; renderer: 'default' | 'fullscreen' };

export type ExtendedOutcome = SlashOutcome | StatefulOutcome;

export function builtin(
  name: string,
  description: string,
  handler: (
    args: string,
    opts: { globalOpts: import('../../../utils/output.js').GlobalOptions },
  ) => Promise<ExtendedOutcome> | ExtendedOutcome,
): SlashCommand {
  return {
    name,
    description,
    source: 'builtin',
    handler: async (ctx) => {
      return (await handler(ctx.args, {
        globalOpts: ctx.globalOpts,
      })) as SlashOutcome;
    },
  };
}
