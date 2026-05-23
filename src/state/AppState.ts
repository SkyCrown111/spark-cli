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

export type PermissionMode = 'default' | 'plan' | 'auto' | 'acceptEdits' | 'dontAsk' | 'bypass';
export type VimMode = 'INSERT' | 'NORMAL' | 'VISUAL' | 'VISUAL LINE';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface TokenUsage {
  used: number;
  budget: number;
}

export interface AppState {
  // ── Session ──
  /** Current session ID for resume/continue. */
  sessionId: string;

  // ── Project ──
  /** Project root directory (for file suggestions, git context, etc.) */
  projectRoot: string;

  // ── Conversation ──
  messages: ChatMessage[];
  /** Raw agent history (not displayed directly) */
  agentHistory: ChatMessage[];
  /** Empty-state welcome card content. */
  welcomeMessage?: string;

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
  showCostThresholdDialog: boolean;
  showIdleReturnDialog: boolean;
  showAutoModeOptIn: boolean;
  showBypassPermissions: boolean;
  showGlobalSearch: boolean;
  showTranscript: boolean;
  showSessionPicker: boolean;

  // ── Global search ──
  searchQuery: string;

  // ── Command suggestions (from slash registry) ──
  commandSuggestions: Array<{
    value: string;
    label: string;
    description?: string;
    category?: string;
  }>;

  // ── Transcript ──
  transcriptSearchQuery: string;

  // ── Thinking ──
  showThinking: boolean;

  // ── Effort / Fast mode ──
  /** Reasoning effort level (low = quick, max = deepest). */
  effortLevel: EffortLevel;
  /** Fast mode: reduced reasoning for quicker responses. */
  fastMode: boolean;

  // ── Active tool tracking ──
  /** Current tool being executed (drives SpinnerWithVerb) */
  activeToolId: string | undefined;
  /** Context detail for active tool (e.g. file name) */
  activeToolDetail: string | undefined;

  // ── Streaming ──
  /** Partial assistant content being streamed via onDelta */
  streamingContent: string;
  /** Whether the agent is currently streaming a response */
  isStreaming: boolean;

  // ── Permission request ──
  /** Pending permission request (if any) */
  permissionRequest: PermissionRequestState | undefined;

  // ── Footer items ──
  footerItems: FooterItem[];

  // ── Git: PR badge ──
  /** PR status badge shown in footer. */
  prBadge?: { number: number; status: string; url: string };

  // ── Git: checkpoint ──
  /** Current checkpoint metadata. */
  checkpoint?: { id: string; timestamp: string };

  // ── Background agents ──
  /** List of tracked background agent statuses. */
  backgroundAgents: Array<{ id: string; name: string; status: string }>;
  /** Currently attached background agent ID (for log streaming). */
  attachedAgentId?: string;

  // ── Todo list ──
  /** Current session's todo items (synced from TodoStore). */
  todos: Array<{ id: string; subject: string; status: string; activeForm?: string }>;

  // ── Session picker ──
  /** Sessions available for resume (populated when picker opens). */
  sessionList: Array<{
    id: string;
    name?: string;
    title: string;
    updatedAt: string;
    messageCount: number;
  }>;
}

export interface FooterItem {
  id: string;
  label: string;
  action?: () => void;
}

/** State for an active permission request dialog */
export interface PermissionRequestState {
  /** Tool name requesting permission */
  tool: string;
  /** Summary of the tool action */
  argsSummary: string;
  /** Whether "always allow" option is available */
  showAlwaysAllow: boolean;
  /** Resolve the permission promise */
  resolve: (answer: 'allow' | 'deny' | 'allow-always') => void;
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
  // Session
  sessionId: '',
  // Project
  projectRoot: process.cwd(),
  // Conversation
  messages: [],
  agentHistory: [],
  welcomeMessage: undefined,
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
  showCostThresholdDialog: false,
  showIdleReturnDialog: false,
  showAutoModeOptIn: false,
  showBypassPermissions: false,
  showGlobalSearch: false,
  showTranscript: false,
  showSessionPicker: false,
  // Global search
  searchQuery: '',
  // Command suggestions
  commandSuggestions: [],
  // Transcript
  transcriptSearchQuery: '',
  // Thinking
  showThinking: false,
  // Effort / Fast mode
  effortLevel: 'medium',
  fastMode: false,
  // Active tool
  activeToolId: undefined,
  activeToolDetail: undefined,
  // Streaming
  streamingContent: '',
  isStreaming: false,
  // Permission request
  permissionRequest: undefined,
  // Footer
  footerItems: [],
  // Git
  prBadge: undefined,
  checkpoint: undefined,
  // Background agents
  backgroundAgents: [],
  attachedAgentId: undefined,
  // Todo list
  todos: [],
  // Session picker
  sessionList: [],
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
export function useSetAppState(): (
  partial: Partial<AppState> | ((prev: AppState) => Partial<AppState>),
) => void {
  return appState.setState;
}
