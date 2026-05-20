/**
 * AppState — centralized state store for the Ink REPL.
 *
 * Uses Zustand for lightweight, selector-based subscriptions.
 * Components read state via `useAppState(selector)` and update
 * via `useSetAppState()` or direct `appState.setState()`.
 *
 * Replaces the scattered useState/useRef pattern in ink-repl.tsx
 * and REPL.tsx, enabling any component to access REPL state
 * without prop drilling.
 */

import { create } from 'zustand';
import type { ChatMessage } from '../core/providers/openai-compatible.js';
import type { InputMode } from '../components/PromptInput/PromptInput.js';
import type { ToolWriteMode } from '../core/agent/tool-registry.js';
import type { PlanState } from '../core/slash/plan-mode.js';
import { ToolPermissionSession } from '../core/agent/tool-permissions.js';

// ── Types ──────────────────────────────────────────────────────

export type PermissionMode = 'default' | 'plan' | 'auto' | 'bypass';
export type VimMode = 'INSERT' | 'NORMAL';

export interface TokenUsage {
  used: number;
  budget: number;
}

export interface AppState {
  // ── Conversation ──
  messages: ChatMessage[];
  /** Raw agent history (not displayed directly) */
  agentHistory: ChatMessage[];

  // ── UI state ──
  mode: InputMode;
  loading: boolean;
  statusText: string | undefined;
  model: string;

  // ── Tokens / cost ──
  tokenUsage: TokenUsage | undefined;

  // ── Permissions ──
  writeMode: ToolWriteMode;
  permissionMode: PermissionMode;
  toolPermissionSession: ToolPermissionSession;

  // ── Plan ──
  plan: PlanState;

  // ── Vim (optional) ──
  vimMode: VimMode;
  vimEnabled: boolean;

  // ── Theme / status line ──
  statusLineText: string | undefined;
  companionEnabled: boolean;
  sessionTitle: string;

  // ── Overlay dialogs ──
  showModelPicker: boolean;
  showThemePicker: boolean;
  showSettingsPanel: boolean;
  showOnboarding: boolean;

  // ── Footer items ──
  footerItems: FooterItem[];
}

export interface FooterItem {
  id: string;
  label: string;
  action?: () => void;
}

// ── Store ──────────────────────────────────────────────────────

/**
 * Create a default ToolPermissionSession for the initial state.
 * This is called once at store creation time.
 */
function createDefaultPermissionSession(): ToolPermissionSession {
  return new ToolPermissionSession();
}

export const appState = create<AppState>(() => ({
  // Conversation
  messages: [],
  agentHistory: [],
  // UI
  mode: 'chat',
  loading: false,
  statusText: undefined,
  model: 'loading...',
  // Tokens
  tokenUsage: undefined,
  // Permissions
  writeMode: 'staging',
  permissionMode: 'default',
  toolPermissionSession: createDefaultPermissionSession(),
  // Plan
  plan: { phase: 'normal' },
  // Vim
  vimMode: 'INSERT',
  vimEnabled: false,
  // Theme / status
  statusLineText: undefined,
  companionEnabled: false,
  sessionTitle: '',
  // Overlay dialogs
  showModelPicker: false,
  showThemePicker: false,
  showSettingsPanel: false,
  showOnboarding: false,
  // Footer
  footerItems: [],
}));

// ── Hooks ──────────────────────────────────────────────────────

/**
 * Subscribe to a slice of AppState using a selector.
 * Only re-renders when the selected value changes.
 *
 * @example
 * ```tsx
 * const mode = useAppState(s => s.mode);
 * const loading = useAppState(s => s.loading);
 * ```
 */
export function useAppState<T>(selector: (s: AppState) => T): T {
  return appState(selector);
}

/**
 * Get the setState function for updating AppState.
 * Use this in event handlers / effects.
 *
 * @example
 * ```tsx
 * const setAppState = useSetAppState();
 * setAppState({ loading: true });
 * ```
 */
export function useSetAppState(): (partial: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void {
  return appState.setState;
}