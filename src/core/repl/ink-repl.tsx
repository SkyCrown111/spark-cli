/**
 * Ink-based REPL runner
 *
 * Wraps the REPL screen component in an Ink render loop and bridges
 * it to the existing shell infrastructure (agent turns, slash commands,
 * staging, etc.).
 *
 * After Phase 16-A: uses AppState (Zustand) for state management
 * instead of scattered useState/useRef. The bridge writes to the
 * global store; the REPL reads from it via selectors.
 *
 * This module is imported lazily so that the ink/react bundle is only
 * loaded when the --ink flag is used.
 */

import React, { useCallback, useRef, useEffect } from 'react';
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
import { askToolConfirm } from './tool-confirm.js';
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
      const newSnapshot = createSession(projectRoot, modelState || 'unknown');
      appState.setState({
        sessionId: newSnapshot.id,
        writeMode: _shellOpts.auto ? 'direct' : 'staging',
        plan: createPlanState(),
        toolPermissionSession: session,
      });
    }
  }, [_shellOpts.auto, projectRoot]);

  // ── Handle user input ──
  const handleSubmit = useCallback(
    async (text: string, mode: InputMode) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Reset idle timer on user activity
      lastActivityRef.current = Date.now();

      const state = appState.getState();

      // Handle slash commands
      if (trimmed.startsWith('/')) {
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

        if (trimmed === '/exit' || trimmed === '/quit') {
          onDone();
          exit();
          return;
        }

        if (trimmed === '/clear') {
          appState.setState({ messages: [], agentHistory: [] });
          return;
        }

        if (trimmed === '/model') {
          appState.setState((prev) => ({
            messages: [...prev.messages, { role: 'user', content: trimmed }, { role: 'assistant', content: `Current model: ${prev.model}` }],
          }));
          return;
        }

        if (trimmed === '/auto') {
          appState.setState((prev) => ({
            writeMode: prev.writeMode === 'direct' ? 'staging' : 'direct',
          }));
          return;
        }

        if (trimmed === '/plan') {
          const prev = appState.getState();
          if (!isPlanMode(prev.plan)) {
            appState.setState({ plan: forceEnterPlan(), mode: 'plan' });
          }
          return;
        }

        // Try dispatching through the slash registry
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
        } catch {
          // Fall through to agent
        }
      }

      // Run an agent turn
      const isPlan = mode === 'plan' || isPlanMode(state.plan);

      appState.setState((prev) => ({
        messages: [...prev.messages, { role: 'user', content: trimmed }],
        loading: true,
        statusText: 'Thinking...',
      }));

      const controller = new AbortController();
      activeControllerRef.current = controller;

      try {
        const expanded = expandAtReferences(projectRoot, trimmed);
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
          toolPermissionSession: state.toolPermissionSession,
          confirmTool: async (req: { tool: string; argsSummary: string }) => {
            if (state.toolPermissionSession.isAlwaysAllowed(req.tool)) return true;
            const answer = await askToolConfirm(req);
            if (answer === 'allow-always') {
              state.toolPermissionSession.allowAlways(req.tool);
              return true;
            }
            return answer === 'allow';
          },
        });

        // Update state
        appState.setState((prev) => ({
          agentHistory: result.history,
          plan: isPlan && result.finalContent ? prev.plan : prev.plan,
        }));

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
        appState.setState({ loading: false, statusText: undefined });
      }
    },
    [opts, registry, projectRoot, exit, onDone],
  );

  const handleExit = useCallback(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    appState.setState({ loading: false });
    onDone();
    exit();
  }, [exit, onDone]);

  // Global key handler for Ctrl+C abort
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c' && activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
      appState.setState({ loading: false, statusText: 'Interrupted' });
      setTimeout(() => appState.setState({ statusText: undefined }), 1500);
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
 * This is the public entry point — called by `runShell` when `--ink` is set.
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