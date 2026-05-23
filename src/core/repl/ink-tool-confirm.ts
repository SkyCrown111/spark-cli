/**
 * Ink-native tool permission confirmation.
 *
 * Replaces the readline-based askToolConfirm from tool-confirm.ts
 * when running inside the Ink render loop. Instead of writing raw
 * ANSI escape codes to stdout, this sets the `permissionRequest`
 * field in AppState so the Ink PermissionRequest component renders
 * the dialog within the React tree.
 *
 * Concurrent confirmations are serialized via a promise chain
 * (same pattern as tool-confirm.ts) to prevent stacked dialogs.
 */

import { appState } from '../../state/AppState.js';
import type { PermissionRequestState } from '../../state/AppState.js';
import type { ToolConfirmRequest, ToolConfirmFn } from '../agent/tool-permissions.js';

type InkToolConfirmAnswer = 'allow' | 'deny' | 'allow-always';

/** Serialization chain — concurrent confirmations queue up. */
let confirmChain: Promise<unknown> = Promise.resolve();

function enqueueConfirm<T>(fn: () => Promise<T>): Promise<T> {
  const next = confirmChain.then(fn, fn);
  confirmChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function askToolConfirmInk(req: ToolConfirmRequest): Promise<InkToolConfirmAnswer> {
  return enqueueConfirm(
    () =>
      new Promise<InkToolConfirmAnswer>((resolve) => {
        const state: PermissionRequestState = {
          tool: req.tool,
          argsSummary: req.argsSummary,
          showAlwaysAllow: true,
          resolve: (answer) => {
            appState.setState({ permissionRequest: undefined });
            resolve(answer);
          },
        };
        appState.setState({ permissionRequest: state });
      }),
  );
}

/**
 * Build a confirmTool callback suitable for the Ink REPL bridge.
 *
 * Checks isAlwaysAllowed first; if not, displays the Ink
 * PermissionRequest component and waits for user interaction.
 */
export function buildInkToolConfirm(
  toolPermissionSession: import('../agent/tool-permissions.js').ToolPermissionSession,
): ToolConfirmFn {
  return async (req: ToolConfirmRequest): Promise<boolean> => {
    if (toolPermissionSession.isAlwaysAllowed(req.tool)) return true;
    const answer = await askToolConfirmInk(req);
    if (answer === 'allow-always') {
      toolPermissionSession.allowAlways(req.tool);
      return true;
    }
    return answer === 'allow';
  };
}
