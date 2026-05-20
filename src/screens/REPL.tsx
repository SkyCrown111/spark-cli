/**
 * REPL screen — Main interactive REPL interface.
 * Composes Messages, PromptInput, StatusBar, and Spinner into a unified UI.
 *
 * After Phase 16-A: reads most state from AppState (Zustand) instead of props.
 * Only imperative callbacks (onSubmit, onExit) remain as props for
 * the bridge component to inject.
 *
 * Layout guarantee: the input area + status bar are ALWAYS visible,
 * even during loading. The messages area shrinks to fit the remaining
 * vertical space. This matches Claude Code's layout where the user
 * always sees the input prompt regardless of agent activity.
 */

import React, { useCallback, useRef } from 'react';
import { Box, useApp } from 'ink';
import { Messages } from '../components/messages/Messages.js';
import { PromptInput, type InputMode } from '../components/PromptInput/PromptInput.js';
import { StatusBar } from '../components/StatusBar/StatusBar.js';
import { KeybindingHints } from '../components/StatusBar/KeybindingHints.js';
import { Spinner } from '../components/design-system/Spinner.js';
import { ErrorBoundary } from '../components/messages/ErrorBoundary.js';
import { ModelPicker } from '../components/ModelPicker.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { SettingsPanel } from '../components/Settings/SettingsPanel.js';
import { Onboarding } from '../components/Onboarding.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { useKeybindings, commonKeybindings } from '../hooks/useKeybindings.js';
import {
  useRegisterKeybindingContext,
  useKeybinding,
} from '../keybindings/useKeybinding.js';
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';
import {
  useAppState,
  useSetAppState,
} from '../state/AppState.js';
import {
  selectMessages,
  selectMode,
  selectLoading,
  selectModel,
  selectTokenUsage,
  selectStatusText,
} from '../state/selectors.js';

export interface REPLProps {
  /** Callback when user submits a line (agent turn) */
  onSubmit: (text: string, mode: InputMode) => void;
  /** Callback to request exit */
  onExit?: () => void;
}

/**
 * REPL — the main interactive screen.
 *
 * Layout (top → bottom):
 *   1. Messages area (flexible height, scrolls)
 *   2. Spinner (visible during agent turns)
 *   3. PromptInput
 *   4. KeybindingHints
 *   5. StatusBar
 */
export const REPL: React.FC<REPLProps> = ({
  onSubmit,
  onExit,
}) => {
  const { width, height } = useTerminalSize();
  const { exit } = useApp();
  const setAppState = useSetAppState();

  // ── State from AppState ──
  const messages = useAppState(selectMessages);
  const mode = useAppState(selectMode);
  const loading = useAppState(selectLoading);
  const model = useAppState(selectModel);
  const tokenUsage = useAppState(selectTokenUsage);
  const statusText = useAppState(selectStatusText);
  const showModelPicker = useAppState((s) => s.showModelPicker);
  const showThemePicker = useAppState((s) => s.showThemePicker);
  const showSettingsPanel = useAppState((s) => s.showSettingsPanel);
  const showOnboarding = useAppState((s) => s.showOnboarding);
  const writeMode = useAppState((s) => s.writeMode);
  const permissionMode = useAppState((s) => s.permissionMode);
  const vimEnabled = useAppState((s) => s.vimEnabled);
  const companionEnabled = useAppState((s) => s.companionEnabled);

  // ── Local state ──
  const historyHook = useInputHistory({ maxHistory: 100 });
  const pendingExit = useRef(false);

  // ── Mode cycling ──
  const handleModeChange = useCallback((nextMode: InputMode) => {
    setAppState({ mode: nextMode });
  }, [setAppState]);

  // ── Submit handler ──
  const handleSubmit = useCallback(
    (text: string) => {
      historyHook.addToHistory(text);
      setAppState({ loading: true, statusText: 'Thinking...' });
      onSubmit(text, mode);
    },
    [mode, onSubmit, historyHook, setAppState],
  );

  // ── Keybindings ──
  useKeybindings({
    bindings: [
      commonKeybindings.interrupt(() => {
        setAppState({ loading: false });
      }),
      commonKeybindings.exit(() => {
        if (pendingExit.current) {
          onExit?.();
          exit();
        } else {
          pendingExit.current = true;
          setAppState({ statusText: 'Ctrl-D again to exit' });
          setTimeout(() => {
            pendingExit.current = false;
            setAppState({ statusText: undefined });
          }, 2000);
        }
      }),
      commonKeybindings.clear(() => {
        setAppState({ messages: [], agentHistory: [] });
      }),
    ],
    enabled: !loading,
  });

  // ── Context-based keybinding system ──
  // Register Chat context as active when not in a sub-dialog
  useRegisterKeybindingContext('Chat', !loading);

  // Register action handlers for context-based bindings
  useKeybinding('app:interrupt', () => {
    setAppState({ loading: false });
  }, !loading);

  useKeybinding('app:redraw', () => {
    setAppState({ messages: [], agentHistory: [] });
  }, !loading);

  useKeybinding('chat:modelPicker', () => {
    setAppState({ showModelPicker: true });
  }, !loading);

  // ── Overlay action handlers ──
  const handleModelSelect = useCallback((selectedModel: string) => {
    setAppState({ model: selectedModel, showModelPicker: false });
  }, [setAppState]);

  const handleThemeSelect = useCallback((_themeName: string) => {
    setAppState({ showThemePicker: false });
  }, [setAppState]);

  const handleSettingsChange = useCallback((key: string, value: any) => {
    setAppState({ [key]: value });
  }, [setAppState]);

  const handleDismissOnboarding = useCallback(() => {
    setAppState({ showOnboarding: false });
  }, [setAppState]);

  // ── Dynamic shortcut hints ──
  const shortcutHints = useShortcutDisplay(undefined, 6);

  // ── Layout strategy (Claude Code FullscreenLayout pattern) ──
  // Two-section layout that guarantees the input box is ALWAYS visible:
  //
  // ┌──────────────────────────────┐
  // │  Top section (flexGrow=1)    │ ← Messages area, overflow hidden
  // │  overflow="hidden"           │    Shrinks to accommodate footer
  // │                              │
  // ├──────────────────────────────┤
  // │  Bottom section (shrink=0)   │ ← Pinned footer, NEVER shrinks
  // │  maxHeight="50%"             │    Capped at half screen
  // │  ┌─ inner (overflowY hidden)┐│    Contains spinner + input + hints + status
  // │  │  Spinner (if loading)    ││
  // │  │  PromptInput             ││
  // │  │  KeybindingHints         ││
  // │  │  StatusBar               ││
  // │  └─────────────────────────┘│
  // └──────────────────────────────┘
  //
  // The bottom section uses flexShrink={0} + maxHeight="50%" with a
  // nested overflowY="hidden" Box — this is the same pattern Claude Code
  // uses in FullscreenLayout.tsx. The inner overflowY="hidden" prevents
  // the bottom section from expanding beyond its allocated space.
  //
  // Additionally, we compute a safe maxHeight for the Messages component
  // as a safety net, ensuring messages never push the footer off screen.

  // Footer height estimate: Spinner(1) + PromptInput(~4) + Hints(1) + StatusBar(~2) = 8 rows
  const FOOTER_RESERVE = 9; // 1 extra for safety margin
  const messagesMaxHeight = Math.max(1, height - FOOTER_RESERVE);

  return (
    <ErrorBoundary>
    <Box flexDirection="column" width={width} height={height}>
      {/* ── Top section: scrollable messages, shrinks to fit ── */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Messages messages={messages} maxHeight={messagesMaxHeight} />
      </Box>

      {/* ── Bottom section: pinned footer, NEVER shrinks ── */}
      <Box flexDirection="column" flexShrink={0} width="100%" maxHeight="50%">
        <Box flexDirection="column" width="100%" flexGrow={1} overflowY="hidden">
          {/* Loading spinner — shows during agent turns */}
          {loading && (
            <Box paddingX={1} flexShrink={0}>
              <Spinner type="dots" label="Thinking..." color="cyan" />
            </Box>
          )}

          {/* Input area — ALWAYS visible, disabled during loading */}
          <Box flexShrink={0}>
            <PromptInput
              onSubmit={handleSubmit}
              mode={mode}
              onModeChange={handleModeChange}
              disabled={loading}
              history={historyHook.history}
              onHistoryNavigate={() => {
                historyHook.resetNavigation();
              }}
              multiline={true}
              maxLines={5}
              placeholder={mode === 'plan' ? 'Plan mode — describe your goal...' : 'Type your message...'}
            />
          </Box>

          {/* Keyboard shortcut hints — ALWAYS visible */}
          <Box flexShrink={0}>
            <KeybindingHints
              visible={true}
              hints={shortcutHints.map((h) => ({
                keys: h.key,
                description: h.description,
              }))}
            />
          </Box>

          {/* Status bar — ALWAYS visible */}
          <Box flexShrink={0}>
            <StatusBar
              mode={mode}
              tokensUsed={tokenUsage?.used ?? 0}
              tokensBudget={tokenUsage?.budget ?? 0}
              model={model}
              status={statusText}
              showBorder={true}
              showTokenPercentage={true}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Overlay dialogs ── */}
      {showModelPicker && (
        <ModelPicker
          currentModel={model}
          onSelect={handleModelSelect}
          onCancel={() => setAppState({ showModelPicker: false })}
        />
      )}
      {showThemePicker && (
        <ThemePicker
          onSelect={handleThemeSelect}
          onCancel={() => setAppState({ showThemePicker: false })}
        />
      )}
      {showSettingsPanel && (
        <SettingsPanel
          writeMode={writeMode}
          permissionMode={permissionMode}
          vimEnabled={vimEnabled}
          companionEnabled={companionEnabled}
          onSettingChange={handleSettingsChange}
          onClose={() => setAppState({ showSettingsPanel: false })}
        />
      )}
      {showOnboarding && (
        <Onboarding
          onDismiss={handleDismissOnboarding}
        />
      )}
    </Box>
    </ErrorBoundary>
  );
};

/**
 * Exported hook interface for imperative REPL control.
 * Shell.ts / ink-repl.tsx can call these from outside the React tree
 * via `appState.setState()`.
 */
export interface REPLHandle {
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setMode: (mode: InputMode) => void;
  setTokenUsage: (used: number, budget: number) => void;
  getMessages: () => any[];
  getMode: () => InputMode;
}