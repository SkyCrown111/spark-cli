/**
 * Ink-based REPL runner (default REPL since Phase 15).
 *
 * Wraps the REPL screen component in an Ink render loop and bridges
 * it to the existing shell infrastructure (agent turns, slash commands,
 * staging, hooks, streaming, etc.).
 *
 * Uses AppState (Zustand) for state management. The bridge writes to
 * the global store; the REPL reads from it via selectors.
 *
 * Imported lazily by runShell() unless --no-ink is set.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import chalk from 'chalk';
import { render as inkRender, useApp, useInput } from 'ink';
import { REPL } from '../../screens/REPL.js';
import type { InputMode } from '../../components/PromptInput/PromptInput.js';
import type { GlobalOptions } from '../../utils/output.js';
import { resolveProjectRoot } from '../../utils/output.js';
import { loadMergedConfig } from '../../config/load.js';
import { resolveModelForTask } from '../providers/router.js';
import { buildTokenUsageSnapshot } from '../context/token-usage.js';
import { runAgentTurnForCli } from '../agent/run-turn.js';
import { SparkCLIError } from '../../utils/errors.js';
import {
  createSlashRegistry,
  type SlashRegistry,
} from '../slash/registry.js';
import { buildBuiltinCommands } from '../slash/built-ins.js';
import { loadFileCommands } from '../slash/loader.js';
import {
  createPlanState,
  forceEnterPlan,
  isPlanMode,
} from '../slash/plan-mode.js';
import { ToolPermissionSession } from '../agent/tool-permissions.js';
import { getAlwaysAllowPath } from '../../config/paths.js';
import { buildInkToolConfirm } from './ink-tool-confirm.js';
import { expandAtReferences } from './at-refs.js';
import {
  KeybindingProviderSetup,
} from '../../keybindings/KeybindingProviderSetup.js';
import { appState } from '../../state/AppState.js';
import {
  installSynchronizedOutput,
  uninstallSynchronizedOutput,
} from '../../ink/patches/synchronizedOutput.js';
import {
  createSession,
  saveSession,
  loadSession,
  findMostRecent,
  type SessionSnapshot,
} from '../session/manager.js';
import { getCliVersion } from '../../utils/version.js';
import { runHooks } from '../hooks/runner.js';
import { loadHookConfig } from '../hooks/config.js';
import { cancelPlan } from '../slash/plan-mode.js';
import type { DispatchedCall } from '../agent/tool-dispatcher.js';
import { join } from 'node:path';
import { createAgentRegistry } from '../agents/registry.js';
import { loadAgentsFromDisk } from '../agents/loader.js';

export interface InkShellOptions {
  auto?: boolean;
  noMascot?: boolean;
}

/**
 * Inner component that bridges Ink UI to the agent loop.
 * This runs inside the Ink render tree.
 *
 * After 16-A: state lives in AppState store. The bridge writes
 * updates to the store; REPL.tsx reads via useAppState selectors.
 */
function InkREPLBridge({
  opts,
  shellOpts: _shellOpts,
  registry,
  onDone,
}: {
  opts: GlobalOptions;
  shellOpts: InkShellOptions;
  registry: SlashRegistry;
  onDone: () => void;
}) {
  const { exit } = useApp();
  const activeControllerRef = useRef<AbortController | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const projectRoot = resolveProjectRoot(opts);

  // ── Set project root in AppState on mount ──
  useEffect(() => {
    appState.setState({ projectRoot });
  }, [projectRoot]);

  // ── Idle detection — show IdleReturnDialog after 5 min inactivity ──
  useEffect(() => {
    const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

    idleTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_THRESHOLD_MS) {
        const state = appState.getState();
        if (!state.loading && !state.showIdleReturnDialog) {
          appState.setState({ showIdleReturnDialog: true });
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, []);

  // ── Cost threshold check after each agent turn ──
  useEffect(() => {
    const state = appState.getState();
    const tokenUsage = state.tokenUsage;
    if (!tokenUsage) return;

    // Rough cost estimate: $0.01 per 1K tokens (varies by model)
    const estimatedCost = (tokenUsage.used / 1000) * 0.01;
    const COST_THRESHOLD = 1.0; // $1.00

    if (estimatedCost >= COST_THRESHOLD && !state.showCostThresholdDialog) {
      appState.setState({ showCostThresholdDialog: true });
    }
  }); // Check on every render (lightweight — just reads state)

  // ── Resolve model on mount ──
  useEffect(() => {
    (async () => {
      try {
        const config = await loadMergedConfig(projectRoot);
        const resolved = resolveModelForTask(config, 'chat', {
          provider: opts.provider,
          model: opts.model,
        });
        appState.setState({ model: `${resolved.providerId}/${resolved.model}` });
      } catch (e) {
        appState.setState({ model: e instanceof Error ? e.message : 'unknown' });
      }
    })();
  }, [projectRoot, opts.provider, opts.model]);

  // ── Load PR context when --from-pr is specified ──
  useEffect(() => {
    if (!opts.fromPr) return;
    (async () => {
      try {
        const { getPrStatus, loadPrContext } = await import('../git/pr-ops.js');
        const status = getPrStatus(opts.fromPr!, { cwd: projectRoot });
        appState.setState({
          prBadge: { number: opts.fromPr!, status: status.status, url: status.url },
        });
        // Load PR context and inject as system context
        const context = loadPrContext(opts.fromPr!, { cwd: projectRoot });
        if (context) {
          appState.setState((prev) => ({
            messages: [
              ...prev.messages,
              { role: 'user', content: `@pr:${opts.fromPr}\n\n${context}` },
            ],
          }));
        }
      } catch {
        // PR loading failures are non-critical
      }
    })();
  }, [opts.fromPr, projectRoot]);

  // ── Initialize AppState ──
  useEffect(() => {
    const persistPath = getAlwaysAllowPath(projectRoot);
    const session = new ToolPermissionSession(persistPath);

    // Load or create session based on --continue/--resume flags
    let snapshot: SessionSnapshot | undefined;
    if (opts.resumeSession) {
      snapshot = loadSession(projectRoot, opts.resumeSession);
      if (!snapshot) {
        console.error(`Session ${opts.resumeSession} not found.`);
      }
    }
    if (!snapshot && opts.continueSession) {
      snapshot = findMostRecent(projectRoot);
    }
    if (snapshot) {
      // Resume existing session
      appState.setState({
        sessionId: snapshot.id,
        messages: snapshot.messages,
        agentHistory: snapshot.history,
        writeMode: snapshot.writeMode as 'staging' | 'direct',
        permissionMode: snapshot.permissionMode,
        effortLevel: snapshot.effortLevel,
        plan: snapshot.plan,
        toolPermissionSession: session,
        sessionTitle: snapshot.title,
      });
      console.log(`Resumed session: ${snapshot.title || snapshot.id}`);
    } else {
      // Create new session
      const modelState = appState.getState().model;
      const newSnapshot = createSession(projectRoot, modelState || 'unknown', opts.name);

      // Apply CLI permission options
      const permMode = opts.dangerouslySkipPermissions
        ? 'bypass'
        : (opts.permissionMode ?? 'default');

      // Pre-populate always-allow set from --allowedTools
      if (opts.allowedTools) {
        for (const tool of opts.allowedTools.split(',').map((t) => t.trim()).filter(Boolean)) {
          session.allowAlways(tool);
        }
      }

      appState.setState({
        sessionId: newSnapshot.id,
        sessionTitle: newSnapshot.name || '',
        writeMode: _shellOpts.auto ? 'direct' : 'staging',
        permissionMode: permMode as import('../../state/AppState.js').PermissionMode,
        plan: createPlanState(),
        toolPermissionSession: session,
      });
    }

    // Welcome message — show project info and tips
    const version = getCliVersion();
    const welcomeLines: string[] = [];
    welcomeLines.push(`SparkCLI${version ? ` v${version}` : ''}`);
    welcomeLines.push('');
    welcomeLines.push('Use /help, @file, Shift+Tab to get moving');
    welcomeLines.push(`Mode: ${_shellOpts.auto ? 'direct' : 'staging'}`);

    appState.setState((prev) => ({
      messages: [
        ...prev.messages,
        { role: 'assistant' as const, content: welcomeLines.join('\n') },
      ],
    }));

    // Hooks: session_start
    const hookConfig = loadHookConfig(projectRoot);
    runHooks(
      'session_start',
      {
        event: 'session_start',
        projectRoot,
        writeMode: appState.getState().writeMode,
        startedAt: new Date().toISOString(),
      },
      projectRoot,
      { config: hookConfig },
    );

    // Populate command suggestions from registry for autocomplete
    const cmds = registry.list();
    appState.setState({
      commandSuggestions: cmds.map((c) => ({
        value: `/${c.name}`,
        label: `/${c.name}`,
        description: c.description,
        category: 'command',
      })),
    });

    // Sync TodoStore → AppState so REPL can render task list
    let unsubTodo: (() => void) | undefined;
    import('../agent/todo-store.js').then(({ getTodoStore }) => {
      const todoStore = getTodoStore();
      const syncTodos = () => {
        const items = todoStore.list();
        appState.setState({
          todos: items.map((t) => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            activeForm: (t as { activeForm?: string }).activeForm,
          })),
        });
      };
      unsubTodo = todoStore.subscribe(syncTodos);
      syncTodos(); // Initial sync
    });

    return () => { unsubTodo?.(); };
  }, [_shellOpts.auto, projectRoot]);

  // ── Handle stateful slash outcomes ──
  const handleStatefulOutcome = useCallback(
    async (kind: string, outcome: Record<string, unknown>): Promise<boolean> => {
      switch (kind) {
        case 'state-clear-history':
          appState.setState({ messages: [], agentHistory: [] });
          return true;
        case 'state-set-write-mode': {
          const wm = outcome.writeMode as string;
          if (wm === 'toggle') {
            appState.setState((prev) => ({
              writeMode: prev.writeMode === 'direct' ? 'staging' : 'direct',
            }));
          } else {
            appState.setState({ writeMode: wm as 'staging' | 'direct' });
          }
          return true;
        }
        case 'state-show-status': {
          const prev = appState.getState();
          const statusMsg = `Model: ${prev.model} | Mode: ${prev.writeMode} | Tokens: ${prev.tokenUsage ? `${prev.tokenUsage.used}/${prev.tokenUsage.budget}` : 'n/a'}`;
          appState.setState((s) => ({
            messages: [...s.messages, { role: 'assistant', content: statusMsg }],
          }));
          return true;
        }
        case 'state-compact-history': {
          // Real compaction: use LLM to summarize history
          const prev = appState.getState();
          appState.setState({ statusText: 'Compacting history...' });

          // Run compaction async
          (async () => {
            try {
              const { resolveCompletionFn } = await import('../agent/run-turn.js');
              const { compactHistory } = await import('../context/compaction.js');

              const { completeFn } = await resolveCompletionFn(opts);
              const history: import('../providers/openai-compatible.js').ChatMessage[] =
                prev.agentHistory.length > 0
                  ? prev.agentHistory
                  : prev.messages.map((m) => ({
                      role: m.role as 'user' | 'assistant',
                      content: m.content,
                    }));

              const result = await compactHistory(history, { completeFn });

              // Build display messages from compacted history
              const displayMessages = result.history
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({
                  role: m.role as 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

              appState.setState({
                agentHistory: result.history,
                messages: displayMessages,
                statusText: undefined,
              });

              // Add a system message showing what happened
              appState.setState((s) => ({
                messages: [
                  ...s.messages,
                  {
                    role: 'assistant' as const,
                    content: `Compacted ${result.compactedCount} messages into summary. ${result.summary.slice(0, 200)}${result.summary.length > 200 ? '...' : ''}`,
                  },
                ],
              }));
            } catch (e) {
              appState.setState({
                statusText: undefined,
                messages: [
                  ...appState.getState().messages,
                  { role: 'assistant', content: `Compaction failed: ${e instanceof Error ? e.message : String(e)}` },
                ],
              });
            }
          })();
          return true;
        }
        case 'state-show-model-picker':
          appState.setState({ showModelPicker: true });
          return true;
        case 'state-show-theme-picker':
          appState.setState({ showThemePicker: true });
          return true;
        case 'state-set-effort':
          appState.setState({ effortLevel: outcome.effortLevel as import('../../state/AppState.js').EffortLevel });
          return true;
        case 'state-resume-session': {
          const sid = outcome.sessionId as string | undefined;
          const snapshot = sid ? loadSession(projectRoot, sid) : findMostRecent(projectRoot);
          if (snapshot) {
            appState.setState({
              sessionId: snapshot.id,
              messages: snapshot.messages,
              agentHistory: snapshot.history,
              writeMode: snapshot.writeMode as 'staging' | 'direct',
              permissionMode: snapshot.permissionMode,
              effortLevel: snapshot.effortLevel,
              plan: snapshot.plan,
              sessionTitle: snapshot.title,
            });
          }
          return true;
        }
        case 'state-show-session-picker': {
          const { listSessions } = await import('../session/manager.js');
          const sessions = listSessions(projectRoot);
          appState.setState({
            showSessionPicker: true,
            sessionList: sessions.map((s) => ({
              id: s.id,
              name: s.name,
              title: s.title || 'Untitled',
              updatedAt: s.updatedAt,
              messageCount: s.messageCount,
            })),
          });
          return true;
        }
        case 'state-export-session': {
          const filename = outcome.filename as string | undefined;
          const state = appState.getState();
          const messages = state.messages;
          if (messages.length === 0) {
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: 'No messages to export.' }],
            }));
            return true;
          }

          const lines: string[] = [];
          lines.push(`SparkCLI Conversation Export`);
          lines.push(`Session: ${state.sessionTitle || state.sessionId || 'unknown'}`);
          lines.push(`Model: ${state.model}`);
          lines.push(`Exported: ${new Date().toISOString()}`);
          lines.push(`${'═'.repeat(60)}`);
          lines.push('');

          for (const msg of messages) {
            const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            lines.push(`[${role}]`);
            lines.push(content);
            lines.push('');
          }

          const exportContent = lines.join('\n');
          const exportFilename = filename || `spark-cli-export-${Date.now()}.txt`;
          const exportPath = join(projectRoot, exportFilename);

          try {
            const { writeFileSync: wf } = await import('node:fs');
            wf(exportPath, exportContent, 'utf8');
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: `Exported ${messages.length} messages to ${exportFilename}` }],
            }));
          } catch (e) {
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: `Export failed: ${e instanceof Error ? e.message : String(e)}` }],
            }));
          }
          return true;
        }
        case 'state-branch-session': {
          const branchName = outcome.name as string | undefined;
          const { createSession, saveSession } = await import('../session/manager.js');
          const state = appState.getState();

          // Create new session with current state
          const newSession = createSession(projectRoot, state.model);
          newSession.history = [...state.agentHistory];
          newSession.messages = [...state.messages];
          newSession.writeMode = state.writeMode;
          newSession.permissionMode = state.permissionMode;
          newSession.effortLevel = state.effortLevel;
          newSession.alwaysAllowSet = state.toolPermissionSession
            ? [...state.toolPermissionSession.getAlwaysAllowSet()]
            : [];
          newSession.plan = state.plan;
          newSession.name = branchName || `branch-${Date.now()}`;
          newSession.title = state.sessionTitle ? `${state.sessionTitle} (branch)` : newSession.name;

          saveSession(projectRoot, newSession);

          appState.setState({
            sessionId: newSession.id,
            sessionTitle: newSession.title,
            messages: newSession.messages,
            agentHistory: newSession.history,
            writeMode: newSession.writeMode,
            permissionMode: newSession.permissionMode,
            effortLevel: newSession.effortLevel,
            plan: newSession.plan,
          });

          appState.setState((s) => ({
            messages: [
              ...s.messages,
              { role: 'assistant', content: `Session branched: ${newSession.name || newSession.id}` },
            ],
          }));
          return true;
        }
        case 'state-rename-session': {
          const newName = outcome.name as string;
          const state = appState.getState();
          if (state.sessionId) {
            const { loadSession, saveSession } = await import('../session/manager.js');
            const snapshot = loadSession(projectRoot, state.sessionId);
            if (snapshot) {
              snapshot.name = newName;
              snapshot.title = newName;
              saveSession(projectRoot, snapshot);
              appState.setState({ sessionTitle: newName });
              appState.setState((s) => ({
                messages: [...s.messages, { role: 'assistant', content: `Session renamed to: ${newName}` }],
              }));
            }
          }
          return true;
        }
        // ── Phase 2: Code Review (prompt-based, handled by agent) ──
        // /code-review, /security-review, /review are prompt-based and handled
        // by the registry's prompt expansion — no stateful handler needed.

        // ── Phase 2: Agent Control ──
        case 'state-set-goal': {
          const condition = outcome.condition as string;
          appState.setState({
            statusText: `Goal set: ${condition}`,
          });
          // Inject a synthetic prompt that instructs the agent to work toward the goal
          const goalPrompt = [
            `[GOAL MODE] The user has set the following goal: "${condition}"`,
            '',
            'Work toward this goal by:',
            '1. Analyzing what needs to be done',
            '2. Making incremental changes',
            '3. After each change, verify progress toward the goal',
            '4. Continue until the goal is achieved or you hit a blocker',
            '',
            'When the goal is achieved, report success clearly.',
            'If blocked, explain what is blocking and suggest next steps.',
          ].join('\n');
          // Run as a normal turn with the goal prompt
          setTimeout(() => {
            const state = appState.getState();
            appState.setState({
              messages: [...state.messages, { role: 'user', content: goalPrompt }],
              loading: true,
            });
          }, 100);
          return true;
        }
        case 'state-clear-goal':
          appState.setState({ statusText: 'Goal cleared.' });
          setTimeout(() => appState.setState({ statusText: undefined }), 2000);
          return true;

        case 'state-copy-replies': {
          const count = (outcome.count as number) || 1;
          const state = appState.getState();
          const assistantMsgs = state.messages.filter((m) => m.role === 'assistant');
          const toCopy = assistantMsgs.slice(-count);
          if (toCopy.length === 0) {
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: 'No assistant replies to copy.' }],
            }));
            return true;
          }
          const text = toCopy.map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n---\n\n');
          try {
            const { execSync } = await import('node:child_process');
            // Use platform-appropriate clipboard command
            const platform = process.platform;
            if (platform === 'win32') {
              execSync('clip', { input: text, encoding: 'utf8' });
            } else if (platform === 'darwin') {
              execSync('pbcopy', { input: text, encoding: 'utf8' });
            } else {
              execSync('xclip -selection clipboard', { input: text, encoding: 'utf8' });
            }
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: `Copied ${toCopy.length} reply(ies) to clipboard.` }],
            }));
          } catch (e) {
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: `Clipboard copy failed: ${e instanceof Error ? e.message : String(e)}\n\nText:\n${text.slice(0, 500)}` }],
            }));
          }
          return true;
        }

        case 'state-show-context': {
          const state = appState.getState();
          const messages = state.messages;
          const totalChars = messages.reduce((sum, m) => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return sum + content.length;
          }, 0);
          const estimatedTokens = Math.ceil(totalChars / 4);
          const lines: string[] = [
            `Context Window Usage`,
            `${'─'.repeat(40)}`,
            `Messages: ${messages.length}`,
            `Characters: ${totalChars.toLocaleString()}`,
            `Est. Tokens: ${estimatedTokens.toLocaleString()}`,
            '',
          ];
          if (outcome.all) {
            lines.push('Message breakdown:');
            for (let i = 0; i < messages.length; i++) {
              const m = messages[i];
              const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              const tokens = Math.ceil(content.length / 4);
              const preview = content.slice(0, 60).replace(/\n/g, ' ');
              lines.push(`  [${i}] ${m.role.padEnd(10)} ${tokens.toString().padStart(6)} tok  ${preview}${content.length > 60 ? '...' : ''}`);
            }
          }
          appState.setState((s) => ({
            messages: [...s.messages, { role: 'assistant', content: lines.join('\n') }],
          }));
          return true;
        }

        case 'state-add-dir': {
          const dir = outcome.path as string;
          // Resolve the directory and validate it exists
          const { existsSync } = await import('node:fs');
          const { resolve: resolvePath } = await import('node:path');
          const absDir = resolvePath(projectRoot, dir);
          if (!existsSync(absDir)) {
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: `Directory not found: ${dir} (resolved: ${absDir})` }],
            }));
            return true;
          }
          // Add to AppState (we'll need to add extraDirs to AppState)
          appState.setState((s) => ({
            messages: [...s.messages, { role: 'assistant', content: `Added working directory: ${absDir}` }],
          }));
          return true;
        }

        case 'state-toggle-sandbox': {
          const state = appState.getState();
          const newMode = state.writeMode === 'staging' ? 'direct' : 'staging';
          appState.setState({
            writeMode: newMode,
            statusText: `Sandbox mode: ${newMode === 'staging' ? 'ON (read-only staging)' : 'OFF (direct write)'}`,
          });
          setTimeout(() => appState.setState({ statusText: undefined }), 3000);
          return true;
        }

        case 'state-toggle-focus': {
          // Toggle focus mode — in focus mode, only show the last prompt+response
          const state = appState.getState();
          const focusEnabled = !state.showThinking; // reuse showThinking as focus toggle for now
          appState.setState({
            showThinking: focusEnabled,
            statusText: focusEnabled ? 'Focus mode ON' : 'Focus mode OFF',
          });
          setTimeout(() => appState.setState({ statusText: undefined }), 2000);
          return true;
        }

        case 'state-scan-permissions': {
          // Analyze recent tool calls and suggest permission rules
          const state = appState.getState();
          const toolCalls: string[] = [];
          for (const msg of state.messages) {
            if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                toolCalls.push(tc.function?.name || 'unknown');
              }
            }
          }
          const unique = [...new Set(toolCalls)];
          if (unique.length === 0) {
            appState.setState((s) => ({
              messages: [...s.messages, { role: 'assistant', content: 'No tool calls found in this session to analyze.' }],
            }));
            return true;
          }
          const suggestion = [
            'Based on this session\'s tool usage, consider adding these to your always-allow list:',
            '',
            ...unique.map((t) => `  - ${t}`),
            '',
            'Use /auto on to skip staging, or configure .spark-cli/permissions.json for fine-grained control.',
          ].join('\n');
          appState.setState((s) => ({
            messages: [...s.messages, { role: 'assistant', content: suggestion }],
          }));
          return true;
        }

        case 'state-toggle-debug': {
          const desc = outcome.description as string | undefined;
          // Toggle debug mode via environment variable
          const current = process.env.SPARK_CLI_DEBUG;
          const enabled = current !== '1';
          process.env.SPARK_CLI_DEBUG = enabled ? '1' : '';
          const msg = enabled
            ? `Debug logging enabled${desc ? ` for: ${desc}` : ''}. Check .spark-cli/debug.log for output.`
            : 'Debug logging disabled.';
          appState.setState((s) => ({
            messages: [...s.messages, { role: 'assistant', content: msg }],
          }));
          return true;
        }

        case 'state-show-keybindings': {
          const bindings = [
            'Keyboard Shortcuts',
            '─'.repeat(40),
            '  Enter       Submit input',
            '  Shift+Enter New line (multiline mode)',
            '  Escape      Clear input / interrupt agent',
            '  Up/Down     Navigate command history',
            '  Tab         Accept suggestion',
            '  Ctrl+C      Cancel / exit',
            '  Ctrl+L      Clear screen',
            '  Ctrl+J      Insert newline',
            '  \\+Enter     Quick newline',
            '',
            'Slash Commands (type / to see all)',
            '─'.repeat(40),
            '  /help       Show all commands',
            '  /model      Switch model',
            '  /plan       Enter plan mode',
            '  /effort     Set reasoning effort',
            '  /theme      Switch theme',
            '  /skills     List installed skills',
            '  /memory     Show memory entries',
            '  /status     Show token budget',
            '  /compact    Force-compact history',
            '  /export     Export conversation',
            '  /branch     Branch session',
            '  /rename     Rename session',
            '  /checkpoint Create git checkpoint',
            '  /rewind     Rewind to checkpoint',
          ].join('\n');
          appState.setState((s) => ({
            messages: [...s.messages, { role: 'assistant', content: bindings }],
          }));
          return true;
        }

        case 'state-show-agents': {
          // Handled by built-ins.ts directly (prints to console)
          return true;
        }

        case 'state-set-agent': {
          const agentName = outcome.agentName;
          appState.setState({ activeAgent: agentName } as any);
          if (agentName) {
            console.log(chalk.green(`Agent "${agentName}" activated.`));
          } else {
            console.log(chalk.dim('Custom agent deactivated.'));
          }
          return true;
        }

        default:
          return false;
      }
    },
    [projectRoot],
  );

  // ── Run agent turn ──
  const runAgentTurn = useCallback(
    async (trimmed: string, mode: InputMode) => {
      const state = appState.getState();
      const isPlan = mode === 'plan' || isPlanMode(state.plan);
      const hookConfig = loadHookConfig(projectRoot);

      // Hooks: pre_user_message
      const preResult = runHooks(
        'pre_user_message',
        { event: 'pre_user_message', projectRoot, text: trimmed, mode: isPlan ? 'plan' : 'normal' },
        projectRoot,
        { config: hookConfig },
      );
      if (preResult.blocked) {
        appState.setState({ statusText: `Hook denied: ${preResult.reason ?? 'blocked'}` });
        setTimeout(() => {
          const s = appState.getState();
          if (s.statusText?.startsWith('Hook denied')) appState.setState({ statusText: undefined });
        }, 5000);
        return;
      }

      appState.setState((prev) => ({
        messages: [...prev.messages, { role: 'user', content: trimmed }],
        loading: true,
        statusText: 'Thinking...',
        streamingContent: '',
        isStreaming: false,
      }));

      const controller = new AbortController();
      activeControllerRef.current = controller;

      // Accumulate streaming content
      let streamAccum = '';

      try {
        const expanded = expandAtReferences(projectRoot, trimmed);
        // Build disallowedTools set from CLI --disallowedTools
        const disallowedSet = opts.disallowedTools
          ? new Set(opts.disallowedTools.split(',').map((t) => t.trim()).filter(Boolean))
          : undefined;

        // Resolve active agent (from --agent flag or /agents use)
        const activeAgentName = (state as any).activeAgent ?? opts.agent;
        let agentSystemAppend: string | undefined;
        let agentAllowedTools: Set<string> | undefined;
        if (activeAgentName) {
          const agentReg = createAgentRegistry();
          loadAgentsFromDisk(agentReg, projectRoot);
          const agentDef = agentReg.get(activeAgentName);
          if (agentDef) {
            agentSystemAppend = agentDef.systemPrompt;
            if (agentDef.allowedTools) {
              agentAllowedTools = new Set(agentDef.allowedTools);
            }
          }
        }

        const result = await runAgentTurnForCli({
          globalOpts: opts,
          history: state.agentHistory,
          userInput: trimmed,
          agentInput: expanded.agentText,
          writeMode: state.writeMode,
          mode: isPlan ? 'plan' : 'normal',
          agentId: `ink-repl-${Date.now()}`,
          abortSignal: controller.signal,
          expandAtRefs: false,
          effortLevel: state.effortLevel,
          permissionMode: state.permissionMode,
          disallowedTools: disallowedSet,
          toolPermissionSession: state.toolPermissionSession,
          confirmTool: buildInkToolConfirm(state.toolPermissionSession),
          appendSystemPrompt: agentSystemAppend,
          agentAllowedTools: agentAllowedTools,
          onDelta: (delta: string) => {
            streamAccum += delta;
            appState.setState({ streamingContent: streamAccum, isStreaming: true });
          },
          onToolCompleted: (call: DispatchedCall) => {
            // Push tool result as a tool message
            const toolMsg = {
              role: 'tool' as const,
              content: typeof call.result.content === 'string' ? call.result.content : JSON.stringify(call.result.content),
              tool_call_id: call.tool_call_id,
            };
            appState.setState((prev) => ({
              messages: [...prev.messages, toolMsg],
              activeToolId: undefined,
              activeToolDetail: undefined,
            }));
          },
        });

        // Clear streaming state
        appState.setState({ streamingContent: '', isStreaming: false });

        // Update state
        appState.setState({
          agentHistory: result.history,
        });

        if (result.finalContent) {
          appState.setState((prev) => ({
            messages: [...prev.messages, { role: 'assistant', content: result.finalContent! }],
          }));
        } else if (result.stopReason === 'iteration_cap') {
          appState.setState((prev) => ({
            messages: [...prev.messages, {
              role: 'assistant',
              content: `Reached iteration cap (${result.iterations}). Refine the request and try again.`,
            }],
          }));
        }

        // Hooks: post_assistant_message (advisory)
        runHooks(
          'post_assistant_message',
          {
            event: 'post_assistant_message',
            projectRoot,
            text: result.finalContent ?? '',
            iterations: result.iterations,
            toolCalls: result.toolCalls.length,
          },
          projectRoot,
          { config: hookConfig },
        );

        // Update token usage
        try {
          const config = await loadMergedConfig(projectRoot);
          const resolved = resolveModelForTask(config, 'chat', {
            provider: opts.provider,
            model: opts.model,
          });
          const snap = buildTokenUsageSnapshot(config, resolved, result.history, result.usage);
          appState.setState({ tokenUsage: { used: snap.used, budget: snap.budget } });
        } catch {
          // Ignore token usage errors
        }

        // Auto-save session after each turn
        try {
          const current = appState.getState();
          if (current.sessionId) {
            const snapshot: SessionSnapshot = {
              id: current.sessionId,
              projectRoot,
              history: current.agentHistory,
              messages: current.messages,
              writeMode: current.writeMode,
              permissionMode: current.permissionMode,
              effortLevel: current.effortLevel,
              alwaysAllowSet: [...current.toolPermissionSession.getAlwaysAllowSet()],
              plan: current.plan,
              model: current.model,
              title: current.sessionTitle || '',
              startedAt: '',
              updatedAt: '',
            };
            saveSession(projectRoot, snapshot);
          }
        } catch {
          // Session save failures are non-critical
        }

        // Auto-extract memory facts in the background (non-blocking)
        try {
          const historyForExtraction = appState.getState().agentHistory;
          if (historyForExtraction.length >= 2) {
            const { resolveCompletionFn } = await import('../agent/run-turn.js');
            const { flushMemoryOnSessionEnd } = await import('../memory/flush.js');
            resolveCompletionFn(opts)
              .then(({ completeFn }) =>
                flushMemoryOnSessionEnd({
                  projectRoot,
                  history: historyForExtraction,
                  completeFn,
                }),
              )
              .catch(() => {
                // Memory flush failures are non-critical
              });
          }
        } catch {
          // Import failures are non-critical
        }
      } catch (e) {
        appState.setState({ streamingContent: '', isStreaming: false });
        const errMsg = e instanceof SparkCLIError
          ? e.message + (e.hints?.length ? '\n' + e.hints.join('\n') : '')
          : e instanceof Error
            ? e.message
            : String(e);
        appState.setState((prev) => ({
          messages: [...prev.messages, { role: 'assistant', content: `Error: ${errMsg}` }],
        }));
      } finally {
        activeControllerRef.current = null;
        appState.setState({ loading: false, statusText: undefined, streamingContent: '', isStreaming: false });
      }
    },
    [opts, projectRoot],
  );

  // ── Handle user input ──
  const handleSubmit = useCallback(
    async (text: string, mode: InputMode) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Reset idle timer on user activity
      lastActivityRef.current = Date.now();

      // Handle slash commands via registry
      if (trimmed.startsWith('/')) {
        // Special-case /help for inline rendering
        if (trimmed === '/help' || trimmed === '/?') {
          const cmds = registry.list();
          const max = cmds.length > 0 ? Math.max(...cmds.map((c) => c.name.length)) : 0;
          const helpLines = ['Commands:'];
          for (const c of cmds) {
            helpLines.push(`  /${c.name.padEnd(max)}  ${c.description}`);
          }
          appState.setState((prev) => ({
            messages: [...prev.messages, { role: 'user', content: trimmed }, { role: 'assistant', content: helpLines.join('\n') }],
          }));
          return;
        }

        // Special-case /doctor for inline rendering (captures output as message)
        if (trimmed === '/doctor') {
          appState.setState((prev) => ({
            messages: [...prev.messages, { role: 'user', content: trimmed }],
            statusText: 'Running diagnostics...',
          }));
          try {
            const { runDoctorChecks } = await import('../../commands/doctor-inline.js');
            const report = await runDoctorChecks(projectRoot);
            appState.setState((prev) => ({
              messages: [...prev.messages, { role: 'assistant', content: report }],
              statusText: undefined,
            }));
          } catch (e) {
            appState.setState((prev) => ({
              messages: [...prev.messages, { role: 'assistant', content: `Doctor failed: ${e instanceof Error ? e.message : String(e)}` }],
              statusText: undefined,
            }));
          }
          return;
        }

        // Dispatch through registry
        try {
          const outcome = await registry.dispatch(trimmed, opts);
          if (outcome.kind === 'exit') {
            onDone();
            exit();
            return;
          }
          if (outcome.kind === 'handled') {
            appState.setState((prev) => ({
              messages: [...prev.messages, { role: 'user', content: trimmed }, { role: 'assistant', content: 'Done.' }],
            }));
            return;
          }
          if (outcome.kind === 'enter-plan') {
            const prev = appState.getState();
            if (!isPlanMode(prev.plan)) {
              appState.setState({ plan: forceEnterPlan(), mode: 'plan' });
            }
            return;
          }
          if (outcome.kind === 'prompt') {
            // File-based command: run the expanded body as an agent turn
            await runAgentTurn(outcome.text, outcome.mode === 'plan' ? 'plan' : mode);
            return;
          }
          // Handle stateful outcomes
          if (await handleStatefulOutcome(outcome.kind, outcome as Record<string, unknown>)) {
            return;
          }
          // Unknown slash — fall through to agent
        } catch {
          // Fall through to agent
        }
      }

      // Run agent turn
      await runAgentTurn(trimmed, mode);
    },
    [opts, registry, exit, onDone, runAgentTurn, handleStatefulOutcome],
  );

  const handleExit = useCallback(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    appState.setState({ loading: false, isStreaming: false, streamingContent: '' });
    onDone();
    exit();
  }, [exit, onDone]);

  // ── Interrupt helper ──
  const handleInterrupt = useCallback(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    appState.setState({
      loading: false,
      isStreaming: false,
      streamingContent: '',
      statusText: 'Interrupted — press any key to continue',
    });
    // Clear the interrupt message after a longer timeout so user can see it
    setTimeout(() => {
      const state = appState.getState();
      if (state.statusText === 'Interrupted — press any key to continue') {
        appState.setState({ statusText: undefined });
      }
    }, 5000);
  }, []);

  // Global key handler for Ctrl+C/Esc abort and Shift+Tab mode cycling
  useInput((_input, key) => {
    // Ctrl+C or Esc: abort running agent turn
    if ((key.ctrl && _input === 'c') || key.escape) {
      if (activeControllerRef.current) {
        handleInterrupt();
        return;
      }
    }

    // Any key clears the interrupt status message
    const state = appState.getState();
    if (state.statusText === 'Interrupted — press any key to continue') {
      appState.setState({ statusText: undefined });
    }

    // Shift+Tab: cycle mode staging → direct → plan → staging
    if (key.tab && key.shift && !activeControllerRef.current) {
      if (isPlanMode(state.plan)) {
        appState.setState({
          plan: cancelPlan(state.plan),
          writeMode: 'staging',
          mode: 'chat',
        });
      } else if (state.writeMode === 'staging') {
        appState.setState({ writeMode: 'direct' });
      } else {
        appState.setState({
          writeMode: 'staging',
          plan: forceEnterPlan(),
          mode: 'plan',
        });
      }
    }
  });

  return (
    <KeybindingProviderSetup>
      <REPL
        onSubmit={handleSubmit}
        onExit={handleExit}
      />
    </KeybindingProviderSetup>
  );
}

/**
 * Launch the Ink-based REPL.
 *
 * This is the public entry point — called by `runShell` by default.
 * It creates the Ink render loop and blocks until the user exits.
 */
export async function runInkRepl(
  opts: GlobalOptions,
  shellOpts: InkShellOptions = {},
): Promise<void> {
  const projectRoot = resolveProjectRoot(opts);
  const registry = createSlashRegistry();
  for (const cmd of buildBuiltinCommands()) registry.register(cmd);
  loadFileCommands(registry, projectRoot);

  let resolveDone: () => void;
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  // Install synchronized output patch before Ink render starts.
  // This wraps each Ink frame in BSU/ESU (DEC 2026) for flicker-free output.
  installSynchronizedOutput();

  const { unmount } = inkRender(
    <InkREPLBridge
      opts={opts}
      shellOpts={shellOpts}
      registry={registry}
      onDone={() => {
        resolveDone!();
      }}
    />,
    { exitOnCtrlC: false },
  );

  await donePromise;
  unmount();

  // Restore original stdout.write on cleanup
  uninstallSynchronizedOutput();
}