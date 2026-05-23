/**
 * Plan-mode state machine.
 *
 * Plan mode is a REPL-level mode in which the agent loop runs with
 * `mode: 'plan'`, the registry hides mutation tools, and the dispatcher
 * re-checks (`permissions.isToolAllowed`) every call. The user reviews the
 * proposed plan in prose, then `/exit-plan` either applies (re-runs the same
 * intent in normal mode) or cancels.
 *
 * This module is small on purpose — most of the gating happens in
 * `tool-registry.list({mode:'plan'})` and `permissions.isToolAllowed`. We
 * track only the transitions and the "last user intent" the REPL needs to
 * replay on approval.
 */

export type PlanState =
  | { phase: 'normal' }
  | { phase: 'plan'; lastUserIntent?: string; lastPlanText?: string }
  | { phase: 'pending-approval'; lastUserIntent: string; planText: string };

export function createPlanState(): PlanState {
  return { phase: 'normal' };
}

export function enterPlan(state: PlanState): PlanState {
  if (state.phase !== 'normal') return state;
  return { phase: 'plan' };
}

/**
 * Force plan mode regardless of current phase. Used by Shift+Tab cycling so
 * the REPL can flip directly between modes without first going through
 * normal/cancel transitions.
 */
export function forceEnterPlan(): PlanState {
  return { phase: 'plan' };
}

export function recordPlanTurn(state: PlanState, intent: string, planText: string): PlanState {
  if (state.phase !== 'plan') return state;
  return { phase: 'plan', lastUserIntent: intent, lastPlanText: planText };
}

export function requestApproval(state: PlanState): PlanState | null {
  if (state.phase !== 'plan') return null;
  if (!state.lastUserIntent || !state.lastPlanText) return null;
  return {
    phase: 'pending-approval',
    lastUserIntent: state.lastUserIntent,
    planText: state.lastPlanText,
  };
}

export function approvePlan(state: PlanState): {
  next: PlanState;
  intent: string;
} | null {
  if (state.phase !== 'pending-approval') return null;
  return { next: { phase: 'normal' }, intent: state.lastUserIntent };
}

export function cancelPlan(_state: PlanState): PlanState {
  return { phase: 'normal' };
}

export function isPlanMode(state: PlanState): boolean {
  return state.phase === 'plan';
}
