/**
 * UserToolResultMessage — shared utilities and constants.
 *
 * Defines message prefixes that cc-haha uses to distinguish
 * tool result states, and the routing logic to select the
 * correct sub-component.
 *
 * States:
 * 1. Success — normal tool result (default)
 * 2. Error — tool returned is_error=true
 * 3. Reject — user rejected the tool call
 * 4. Canceled — user canceled the tool call
 * 5. RejectedPlan — plan-mode rejection
 * 6. RejectedToolUse — tool use was rejected
 * 7. Fallback — unrecognized state
 */

// ── Content prefixes ───────────────────────────────────

/** Prefix indicating the tool call was canceled by the user */
export const CANCEL_PREFIX = '[CANCELLED]';
/** Prefix indicating the tool call was rejected by the user */
export const REJECT_PREFIX = '[REJECTED]';
/** Prefix indicating a plan-mode rejection */
export const REJECTED_PLAN_PREFIX = '[PLAN_REJECTED]';
/** Prefix indicating a tool use was rejected */
export const REJECTED_TOOL_USE_PREFIX = '[TOOL_REJECTED]';

// ── State type ─────────────────────────────────────────

export type ToolResultState =
  | 'success'
  | 'error'
  | 'reject'
  | 'canceled'
  | 'rejected-plan'
  | 'rejected-tool-use'
  | 'fallback';

// ── Routing logic ──────────────────────────────────────

export interface ToolResultRoute {
  state: ToolResultState;
  /** The content with the prefix stripped (if applicable) */
  cleanContent: string;
}

/**
 * Determine the tool result state from the message content and error flag.
 *
 * Routing priority:
 * 1. Content starts with CANCEL_PREFIX → canceled
 * 2. Content starts with REJECT_PREFIX → reject
 * 3. Content starts with REJECTED_PLAN_PREFIX → rejected-plan
 * 4. Content starts with REJECTED_TOOL_USE_PREFIX → rejected-tool-use
 * 5. is_error flag → error
 * 6. Otherwise → success
 */
export function routeToolResult(
  content: string,
  isError?: boolean,
): ToolResultRoute {
  if (content.startsWith(CANCEL_PREFIX)) {
    return {
      state: 'canceled',
      cleanContent: content.slice(CANCEL_PREFIX.length).trim(),
    };
  }

  if (content.startsWith(REJECT_PREFIX)) {
    return {
      state: 'reject',
      cleanContent: content.slice(REJECT_PREFIX.length).trim(),
    };
  }

  if (content.startsWith(REJECTED_PLAN_PREFIX)) {
    return {
      state: 'rejected-plan',
      cleanContent: content.slice(REJECTED_PLAN_PREFIX.length).trim(),
    };
  }

  if (content.startsWith(REJECTED_TOOL_USE_PREFIX)) {
    return {
      state: 'rejected-tool-use',
      cleanContent: content.slice(REJECTED_TOOL_USE_PREFIX.length).trim(),
    };
  }

  if (isError) {
    return { state: 'error', cleanContent: content };
  }

  return { state: 'success', cleanContent: content };
}
