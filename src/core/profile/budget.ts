/**
 * Frame budget checks against a target FPS.
 */

import type { ProfileAnalysis } from './analyze.js';

export interface BudgetViolation {
  rule: string;
  severity: 'warn' | 'error';
  message: string;
  actualMs: number;
  budgetMs: number;
}

export interface FrameBudgetReport {
  targetFps: number;
  budgetMs: number;
  violations: BudgetViolation[];
  ok: boolean;
}

export function checkFrameBudget(
  analysis: ProfileAnalysis,
  targetFps: number,
): FrameBudgetReport {
  const budgetMs = 1000 / Math.max(1, targetFps);
  const violations: BudgetViolation[] = [];

  if (analysis.summary.p95FrameMs > budgetMs) {
    violations.push({
      rule: 'p95_frame_time',
      severity: 'error',
      message: `p95 frame ${analysis.summary.p95FrameMs.toFixed(2)}ms exceeds ${budgetMs.toFixed(2)}ms budget`,
      actualMs: analysis.summary.p95FrameMs,
      budgetMs,
    });
  } else if (analysis.summary.avgFrameMs > budgetMs * 0.85) {
    violations.push({
      rule: 'avg_frame_time',
      severity: 'warn',
      message: `Average frame ${analysis.summary.avgFrameMs.toFixed(2)}ms is close to budget`,
      actualMs: analysis.summary.avgFrameMs,
      budgetMs,
    });
  }

  for (const sys of analysis.systems.slice(0, 5)) {
    if (sys.avgMs > budgetMs * 0.4) {
      violations.push({
        rule: `system_${sys.name}`,
        severity: 'warn',
        message: `System "${sys.name}" avg ${sys.avgMs.toFixed(2)}ms (>40% of frame budget)`,
        actualMs: sys.avgMs,
        budgetMs,
      });
    }
  }

  return {
    targetFps,
    budgetMs,
    violations,
    ok: violations.every((v) => v.severity !== 'error'),
  };
}
