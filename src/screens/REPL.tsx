/**
 * REPL screen — Main interactive REPL interface.
 * Composes Messages, PromptInput, StatusLine, and Spinner into a unified UI.
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

import React, { useCallback, useRef, useState } from 'react';
import { Box, useApp } from 'ink';
import { Messages } from '../components/messages/Messages.js';
import { PromptInput, type InputMode } from '../components/PromptInput/PromptInput.js';
import { SpinnerWithVerb } from '../components/Spinner/SpinnerWithVerb.js';
import { StatusLine } from '../components/StatusLine.js';
import { PermissionRequest } from '../components/permissions/PermissionRequest.js';
import { ScrollBox } from '../ink/components/ScrollBox.js';
import { ErrorBoundary } from '../components/messages/ErrorBoundary.js';
import { ModelPicker } from '../components/ModelPicker.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { SettingsPanel } from '../components/Settings/SettingsPanel.js';
import { Onboarding } from '../components/Onboarding.js';
import { CostThresholdDialog } from '../components/CostThresholdDialog.js';
import { IdleReturnDialog } from '../components/IdleReturnDialog.js';
import { AutoModeOptInDialog } from '../components/AutoModeOptInDialog.js';
import { BypassPermissionsDialog } from '../components/BypassPermissionsDialog.js';
import { GlobalSearchDialog } from '../components/GlobalSearchDialog.js';
import { TranscriptOverlay } from '../components/TranscriptOverlay.js';
import { TokenWarning } from '../components/TokenWarning.js';
import { BackgroundTaskStatus } from '../components/BackgroundTaskStatus.js';
import { TaskList } from '../components/TaskList.js';
import { SessionPicker } from '../components/SessionPicker.js';
import { AlternateScreen } from '../ink/components/AlternateScreen.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { useKeybindings, commonKeybindings } from '../hooks/useKeybindings.js';
import { generateGitSuggestions } from '../utils/suggestions/gitSuggestions.js';
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
  selectStreamingContent,
  selectIsStreaming,
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
 *   5. StatusLine
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
  const streamingContent = useAppState(selectStreamingContent);
  const isStreaming = useAppState(selectIsStreaming);
  const showModelPicker = useAppState((s) => s.showModelPicker);
  const showThemePicker = useAppState((s) => s.showThemePicker);
  const showSettingsPanel = useAppState((s) => s.showSettingsPanel);
  const showOnboarding = useAppState((s) => s.showOnboarding);
  const showCostThresholdDialog = useAppState((s) => s.showCostThresholdDialog);
  const showIdleReturnDialog = useAppState((s) => s.showIdleReturnDialog);
  const showAutoModeOptIn = useAppState((s) => s.showAutoModeOptIn);
  const showBypassPermissions = useAppState((s) => s.showBypassPermissions);
  const showGlobalSearch = useAppState((s) => s.showGlobalSearch);
  const showTranscript = useAppState((s) => s.showTranscript);
  const showSessionPicker = useAppState((s) => s.showSessionPicker);
  const sessionList = useAppState((s) => s.sessionList);
  const searchQuery = useAppState((s) => s.searchQuery);
  const transcriptSearchQuery = useAppState((s) => s.transcriptSearchQuery);
  const agentHistory = useAppState((s) => s.agentHistory);
  const writeMode = useAppState((s) => s.writeMode);
  const permissionMode = useAppState((s) => s.permissionMode);
  const vimEnabled = useAppState((s) => s.vimEnabled);
  const vimMode = useAppState((s) => s.vimMode);
  const commandSuggestions = useAppState((s) => s.commandSuggestions);
  const companionEnabled = useAppState((s) => s.companionEnabled);
  const activeToolId = useAppState((s) => s.activeToolId);
  const activeToolDetail = useAppState((s) => s.activeToolDetail);
  const permissionRequest = useAppState((s) => s.permissionRequest);
  const backgroundAgents = useAppState((s) => s.backgroundAgents);
  const todos = useAppState((s) => s.todos);
  const checkpoint = useAppState((s) => s.checkpoint);
  const projectRoot = useAppState((s) => s.projectRoot);

  // ── Git suggestions (cached) ──
  const gitSuggestionsRef = useRef<Array<{ value: string; label: string; source: string }>>([]);
  const getGitSuggestions = useCallback(() => {
    if (gitSuggestionsRef.current.length === 0) {
      try {
        gitSuggestionsRef.current = generateGitSuggestions(projectRoot, '');
      } catch {
        gitSuggestionsRef.current = [];
      }
    }
    return gitSuggestionsRef.current;
  }, [projectRoot]);

  // ── Local state ──
  const historyHook = useInputHistory({ maxHistory: 100 });
  const pendingExit = useRef(false);
  const [transcriptSearchActive, setTranscriptSearchActive] = useState(false);
  const [searchMatches, setSearchMatches] = useState<Array<{ msgIdx: number; charIdx: number }>>([]);
  const [searchFocusIdx, setSearchFocusIdx] = useState(0);

  // ── Global search logic ──
  const updateSearchMatches = useCallback((query: string) => {
    if (!query) {
      setSearchMatches([]);
      setSearchFocusIdx(0);
      return;
    }
    const lower = query.toLowerCase();
    const matches: Array<{ msgIdx: number; charIdx: number }> = [];
    for (let i = 0; i < messages.length; i++) {
      const rawContent = messages[i].content;
      const content: string = typeof rawContent === 'string'
        ? rawContent
        : JSON.stringify(rawContent);
      let idx = 0;
      while (idx < content.length) {
        const found = content.toLowerCase().indexOf(lower, idx);
        if (found === -1) break;
        matches.push({ msgIdx: i, charIdx: found });
        idx = found + 1;
      }
    }
    setSearchMatches(matches);
    setSearchFocusIdx(matches.length > 0 ? 0 : -1);
  }, [messages]);

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return;
    setSearchFocusIdx((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches]);

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return;
    setSearchFocusIdx((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches]);

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

  // ── Bash submit handler ──
  const handleBashSubmit = useCallback(
    (command: string) => {
      historyHook.addToHistory(`!${command}`);
      setAppState({ statusText: `Running: ${command}` });

      // Execute shell command asynchronously
      import('node:child_process').then(({ exec }) => {
        exec(command, { encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => {
          const output = stdout || '';
          const errorOutput = stderr || '';
          const result = err
            ? `Error: ${errorOutput || err.message}`
            : (output || '(no output)') + (errorOutput ? `\nstderr: ${errorOutput}` : '');

          setAppState((prev) => ({
            messages: [
              ...prev.messages,
              { role: 'user', content: `!${command}` },
              { role: 'assistant', content: result },
            ],
            statusText: undefined,
          }));
        });
      });
    },
    [historyHook, setAppState],
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
          setAppState({ statusText: 'Press Ctrl-D again to exit, or wait to cancel' });
          setTimeout(() => {
            if (pendingExit.current) {
              pendingExit.current = false;
              setAppState({ statusText: undefined });
            }
          }, 3000);
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

  // Ctrl+F: Global search
  useKeybinding('chat:search', () => {
    setAppState({ showGlobalSearch: true });
  }, !loading && !showGlobalSearch);

  // Ctrl+O: Toggle transcript overlay
  useKeybinding('app:toggleTranscript', () => {
    setAppState((prev) => ({
      showTranscript: !prev.showTranscript,
      transcriptSearchQuery: '',
    }));
    setTranscriptSearchActive(false);
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
  const shortcutHints = useShortcutDisplay(undefined, 3);

  // ── Layout strategy ──
  // Two-section layout that guarantees the input box is ALWAYS visible.
  // Uses explicit height calculations instead of percentage-based maxHeight,
  // because Ink's Yoga layout does not reliably enforce maxHeight="50%"
  // when the top section has flexGrow={1}.
  //
  // ┌──────────────────────────────┐
  // │  Top section                 │ ← height = total - FOOTER_RESERVE
  // │  overflow="hidden"           │    Fixed height, messages scroll inside
  // │                              │
  // ├──────────────────────────────┤
  // │  Bottom section (shrink=0)   │ ← height = FOOTER_RESERVE (fixed)
  // │  ┌─────────────────────────┐│    Contains spinner + input + hints + status
  // │  │  Spinner (if loading)    ││
  // │  │  PromptInput             ││
  // │  │  KeybindingHints         ││
  // │  │  StatusLine              ││
  // │  └─────────────────────────┘│
  // └──────────────────────────────┘

  // Footer height: Spinner(1) + PromptInput(~2) + StatusLine(1) + padding = 5 rows
  // Always reserve max height to prevent layout shift when spinner appears/disappears
  const FOOTER_RESERVE = 5;
  const messagesHeight = Math.max(1, height - FOOTER_RESERVE);

  return (
    <ErrorBoundary>
    <AlternateScreen mouseTracking={true}>
    <Box flexDirection="column" width={width} height={height}>
      {/* ── Top section: scrollable messages, fixed height ── */}
      <Box flexDirection="column" height={messagesHeight} overflow="hidden">
        <ScrollBox
          rowCount={messages.length}
          estimatedRowHeight={3}
          maxHeight={messagesHeight}
          autoPinToBottom={true}
          scrollingEnabled={!loading}
        >
          {(visibleStart, visibleEnd) => (
            <Messages
              messages={messages}
              maxHeight={messagesHeight}
              visibleRange={[visibleStart, visibleEnd]}
              streamingContent={streamingContent}
              isStreaming={isStreaming}
            />
          )}
        </ScrollBox>

        {/* Token usage warning — shown when approaching budget */}
        {tokenUsage && (
          <TokenWarning used={tokenUsage.used} budget={tokenUsage.budget} />
        )}
      </Box>

      {/* ── Background tasks indicator ── */}
      {backgroundAgents.length > 0 && (
        <Box flexShrink={0}>
          <BackgroundTaskStatus tasks={backgroundAgents} />
        </Box>
      )}

      {/* ── Todo list (agent task tracking) ── */}
      {todos.length > 0 && (
        <Box flexShrink={0} paddingX={1}>
          <TaskList
            tasks={todos.map((t) => ({
              id: t.id,
              label: t.subject,
              status: t.status === 'completed' ? 'completed' :
                      t.status === 'in_progress' ? 'running' : 'pending',
            }))}
          />
        </Box>
      )}

      {/* ── Bottom section: pinned footer, fixed height, NEVER shrinks ── */}
      <Box flexDirection="column" flexShrink={0} width="100%" height={FOOTER_RESERVE} overflow="hidden">
        <Box flexDirection="column" width="100%">
          {/* Loading spinner — shows during agent turns with dynamic verb */}
          {loading && (
            <Box paddingX={1} flexShrink={0}>
              <SpinnerWithVerb
                toolId={activeToolId}
                detail={activeToolDetail}
                verbOverride={activeToolId ? undefined : 'Thinking'}
                color="cyan"
              />
            </Box>
          )}

          {/* Input area — ALWAYS visible, disabled during loading */}
          <Box flexShrink={0}>
            <PromptInput
              onSubmit={handleSubmit}
              onBashSubmit={handleBashSubmit}
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
              vimEnabled={vimEnabled}
              vimMode={vimMode}
              onVimModeChange={(m) => setAppState({ vimMode: m })}
              commandSuggestions={commandSuggestions}
              gitSuggestions={getGitSuggestions()}
            />
          </Box>

          {/* Status line — single row: model + tokens + hints */}
          <Box flexShrink={0}>
            <StatusLine
              model={model}
              tokensUsed={tokenUsage?.used ?? 0}
              tokensBudget={tokenUsage?.budget ?? 0}
              hints={shortcutHints}
              status={statusText}
              writeMode={writeMode}
              planMode={mode === 'plan'}
              checkpointId={checkpoint?.id}
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
      {showCostThresholdDialog && (
        <CostThresholdDialog
          estimatedCost={(tokenUsage?.used ?? 0) * 0.00001}
          threshold={1.0}
          onApprove={() => setAppState({ showCostThresholdDialog: false })}
          onDeny={() => setAppState({ showCostThresholdDialog: false })}
        />
      )}
      {showIdleReturnDialog && (
        <IdleReturnDialog
          idleDuration="a while"
          messageCount={messages.length}
          onContinue={() => setAppState({ showIdleReturnDialog: false })}
          onStartFresh={() => {
            setAppState({ messages: [], agentHistory: [], showIdleReturnDialog: false });
          }}
        />
      )}
      {showAutoModeOptIn && (
        <AutoModeOptInDialog
          onConfirm={() => setAppState({ permissionMode: 'auto', showAutoModeOptIn: false })}
          onCancel={() => setAppState({ showAutoModeOptIn: false })}
        />
      )}
      {showBypassPermissions && (
        <BypassPermissionsDialog
          onConfirm={() => setAppState({ permissionMode: 'bypass', showBypassPermissions: false })}
          onCancel={() => setAppState({ showBypassPermissions: false })}
        />
      )}
      {showSessionPicker && (
        <SessionPicker
          sessions={sessionList}
          onSelect={(sessionId) => {
            setAppState({ showSessionPicker: false, loading: true, statusText: `Resuming session ${sessionId}...` });
            // Trigger resume via the same path as /resume <id>
            import('../core/session/manager.js').then(({ loadSession }) => {
              const snapshot = loadSession('.', sessionId);
              if (snapshot) {
                setAppState({
                  sessionId: snapshot.id,
                  messages: snapshot.messages,
                  agentHistory: snapshot.history,
                  writeMode: snapshot.writeMode as 'staging' | 'direct',
                  permissionMode: snapshot.permissionMode,
                  effortLevel: snapshot.effortLevel,
                  plan: snapshot.plan,
                  sessionTitle: snapshot.title,
                  loading: false,
                  statusText: undefined,
                });
              } else {
                setAppState({ loading: false, statusText: 'Session not found' });
              }
            });
          }}
          onCancel={() => setAppState({ showSessionPicker: false })}
        />
      )}
      {showGlobalSearch && (
        <GlobalSearchDialog
          query={searchQuery}
          onQueryChange={(q) => {
            setAppState({ searchQuery: q });
            updateSearchMatches(q);
          }}
          matchCount={searchMatches.length}
          focusIndex={searchFocusIdx}
          onNextMatch={handleSearchNext}
          onPrevMatch={handleSearchPrev}
          onClose={() => {
            setAppState({ showGlobalSearch: false, searchQuery: '' });
            setSearchMatches([]);
            setSearchFocusIdx(0);
          }}
        />
      )}
      {showTranscript && (
        <TranscriptOverlay
          agentHistory={agentHistory}
          searchQuery={transcriptSearchQuery}
          onSearchQueryChange={(q) => setAppState({ transcriptSearchQuery: q })}
          searchActive={transcriptSearchActive}
          onToggleSearch={() => setTranscriptSearchActive((v) => !v)}
          onClose={() => {
            setAppState({ showTranscript: false, transcriptSearchQuery: '' });
            setTranscriptSearchActive(false);
          }}
        />
      )}

      {/* ── Permission confirmation dialog ── */}
      {permissionRequest && (
        <PermissionRequest
          tool={permissionRequest.tool}
          argsSummary={permissionRequest.argsSummary}
          showAlwaysAllow={permissionRequest.showAlwaysAllow}
          onApprove={(always) => {
            permissionRequest.resolve(always ? 'allow-always' : 'allow');
            setAppState({ permissionRequest: undefined });
          }}
          onDeny={() => {
            permissionRequest.resolve('deny');
            setAppState({ permissionRequest: undefined });
          }}
        />
      )}
    </Box>
    </AlternateScreen>
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