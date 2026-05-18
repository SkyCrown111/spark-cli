import { describe, it, expect } from 'vitest';
import {
  approvePlan,
  cancelPlan,
  createPlanState,
  enterPlan,
  isPlanMode,
  recordPlanTurn,
  requestApproval,
  type PlanState,
} from '../../core/slash/plan-mode.js';

describe('plan-mode state machine', () => {
  it('starts in normal phase', () => {
    const s = createPlanState();
    expect(s.phase).toBe('normal');
    expect(isPlanMode(s)).toBe(false);
  });

  it('enterPlan transitions normal → plan', () => {
    const s = enterPlan(createPlanState());
    expect(s.phase).toBe('plan');
    expect(isPlanMode(s)).toBe(true);
  });

  it('enterPlan is idempotent in plan phase', () => {
    const s = enterPlan(enterPlan(createPlanState()));
    expect(s.phase).toBe('plan');
  });

  it('recordPlanTurn captures intent and plan text only in plan phase', () => {
    const s = enterPlan(createPlanState());
    const next = recordPlanTurn(s, 'do thing', 'plan body');
    expect(next.phase).toBe('plan');
    if (next.phase === 'plan') {
      expect(next.lastUserIntent).toBe('do thing');
      expect(next.lastPlanText).toBe('plan body');
    }
  });

  it('recordPlanTurn ignored when not in plan phase', () => {
    const s: PlanState = { phase: 'normal' };
    const next = recordPlanTurn(s, 'x', 'y');
    expect(next).toBe(s);
  });

  it('requestApproval returns null without recorded turn', () => {
    const s = enterPlan(createPlanState());
    expect(requestApproval(s)).toBeNull();
  });

  it('requestApproval transitions plan → pending-approval with recorded data', () => {
    const s = recordPlanTurn(enterPlan(createPlanState()), 'intent', 'plan body');
    const pending = requestApproval(s);
    expect(pending).not.toBeNull();
    if (pending) {
      expect(pending.phase).toBe('pending-approval');
      if (pending.phase === 'pending-approval') {
        expect(pending.lastUserIntent).toBe('intent');
        expect(pending.planText).toBe('plan body');
      }
    }
  });

  it('approvePlan returns intent and resets to normal phase', () => {
    const recorded = recordPlanTurn(enterPlan(createPlanState()), 'go', 'plan');
    const pending = requestApproval(recorded);
    expect(pending).not.toBeNull();
    const approved = approvePlan(pending!);
    expect(approved).not.toBeNull();
    if (approved) {
      expect(approved.intent).toBe('go');
      expect(approved.next.phase).toBe('normal');
    }
  });

  it('approvePlan refuses non-pending state', () => {
    const s = enterPlan(createPlanState());
    expect(approvePlan(s)).toBeNull();
  });

  it('cancelPlan returns to normal phase from any state', () => {
    expect(cancelPlan(createPlanState()).phase).toBe('normal');
    expect(cancelPlan(enterPlan(createPlanState())).phase).toBe('normal');
    const recorded = recordPlanTurn(enterPlan(createPlanState()), 'i', 'p');
    const pending = requestApproval(recorded)!;
    expect(cancelPlan(pending).phase).toBe('normal');
  });
});
