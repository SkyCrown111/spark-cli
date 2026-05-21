/**
 * Common selectors for AppState.
 * Pre-defined selector functions avoid recreating them on every render.
 */

import type { AppState } from './AppState.js';

// ── Single-field selectors ────────────────────────────────────

export const selectMessages = (s: AppState) => s.messages;
export const selectMode = (s: AppState) => s.mode;
export const selectModel = (s: AppState) => s.model;
export const selectLoading = (s: AppState) => s.loading;
export const selectStatusText = (s: AppState) => s.statusText;
export const selectTokenUsage = (s: AppState) => s.tokenUsage;
export const selectWriteMode = (s: AppState) => s.writeMode;
export const selectPermissionMode = (s: AppState) => s.permissionMode;
export const selectPlan = (s: AppState) => s.plan;
export const selectVimMode = (s: AppState) => s.vimMode;
export const selectVimEnabled = (s: AppState) => s.vimEnabled;
export const selectStatusLineText = (s: AppState) => s.statusLineText;
export const selectCompanionEnabled = (s: AppState) => s.companionEnabled;
export const selectSessionTitle = (s: AppState) => s.sessionTitle;
export const selectShowModelPicker = (s: AppState) => s.showModelPicker;
export const selectShowThemePicker = (s: AppState) => s.showThemePicker;
export const selectShowSettingsPanel = (s: AppState) => s.showSettingsPanel;
export const selectShowOnboarding = (s: AppState) => s.showOnboarding;
export const selectFooterItems = (s: AppState) => s.footerItems;
export const selectStreamingContent = (s: AppState) => s.streamingContent;
export const selectIsStreaming = (s: AppState) => s.isStreaming;
export const selectEffortLevel = (s: AppState) => s.effortLevel;
export const selectFastMode = (s: AppState) => s.fastMode;

// ── Composite selectors ───────────────────────────────────────

/** Is the REPL in plan mode? */
export const selectIsPlanMode = (s: AppState) => s.plan.phase !== 'normal';

/** Token usage as percentage (0–100) */
export const selectTokenPercentage = (s: AppState) => {
  if (!s.tokenUsage) return 0;
  return s.tokenUsage.budget > 0
    ? Math.round((s.tokenUsage.used / s.tokenUsage.budget) * 100)
    : 0;
};

/** Formatted token usage string (e.g., "1.5K / 200K") */
export const selectTokenDisplay = (s: AppState) => {
  if (!s.tokenUsage) return '';
  const used = s.tokenUsage.used >= 1000
    ? `${(s.tokenUsage.used / 1000).toFixed(1)}K`
    : String(s.tokenUsage.used);
  const budget = s.tokenUsage.budget >= 1000
    ? `${(s.tokenUsage.budget / 1000).toFixed(0)}K`
    : String(s.tokenUsage.budget);
  return `${used} / ${budget}`;
};

// ── Background agents ─────────────────────────────────────────

export const selectBackgroundAgents = (s: AppState) => s.backgroundAgents;
export const selectAttachedAgentId = (s: AppState) => s.attachedAgentId;