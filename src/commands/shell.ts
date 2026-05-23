/**
 * Interactive REPL.
 *
 * Phase 4: cut over to the ReAct agent loop.
 * Phase 5: file-based slash registry + plan mode.
 *
 * - Each user line spawns a per-turn `AbortController` so Ctrl-C cancels the
 *   live turn (provider fetch, bash spawn, parallel tool calls). Second Ctrl-C
 *   exits the REPL.
 * - `/auto` toggles `writeMode` between `staging` (default) and `direct`.
 *   `--auto` at launch starts in direct mode.
 * - `/plan` enters plan mode (read-only); subsequent turns run with
 *   `mode: 'plan'` and the registry hides mutation tools. `/exit-plan y`
 *   replays the last intent in normal mode.
 * - Slash commands come from `createSlashRegistry()` plus
 *   `loadFileCommands()` for `.spark/commands/*.md` (with legacy fallback).
 */

import * as readline from 'node:readline';
import { stdin as input } from 'node:process';
import chalk from 'chalk';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { loadMergedConfig } from '../config/load.js';
import { getAlwaysAllowPath } from '../config/paths.js';
import { scanProjectContext } from '../core/context/project-scanner.js';
import { resolveModelForTask } from '../core/providers/router.js';
import { buildTokenUsageSnapshot } from '../core/context/token-usage.js';
import { runAgentTurnForCli } from '../core/agent/run-turn.js';
import type { ToolWriteMode } from '../core/agent/tool-registry.js';
import { SparkCLIError } from '../utils/errors.js';
import { createSlashRegistry, type SlashRegistry } from '../core/slash/registry.js';
import { buildBuiltinCommands } from '../core/slash/built-ins.js';
import { loadFileCommands } from '../core/slash/loader.js';
import {
  cancelPlan,
  createPlanState,
  forceEnterPlan,
  isPlanMode,
  recordPlanTurn,
  type PlanState,
} from '../core/slash/plan-mode.js';
import { runHooks } from '../core/hooks/runner.js';
import { loadHookConfig } from '../core/hooks/config.js';
import { resolveCompletionFn } from '../core/agent/run-turn.js';
import { expandAtReferences } from '../core/repl/at-refs.js';
import { createSlashCompleter } from '../core/repl/repl-ui.js';
import { InputBox, printInputBoxChrome } from '../core/repl/input-box.js';
import {
  printAssistantBlock,
  printAssistantError,
  printInterrupted,
  printToolBatch,
  printUserTurn,
  startThinkingSpinner,
  type ThinkingSpinner,
} from '../core/repl/transcript.js';
import { renderReplWelcome } from '../core/repl/welcome.js';
import { isMascotDisabled, pickGemiFarewell, renderGemiFarewellLine } from '../core/repl/mascot.js';
import { ToolPermissionSession } from '../core/agent/tool-permissions.js';
import { askToolConfirm } from '../core/repl/tool-confirm.js';
import {
  createSession,
  saveSession,
  loadSession,
  findMostRecent,
  type SessionSnapshot,
} from '../core/session/manager.js';
import { flushMemoryOnSessionEnd } from '../core/memory/flush.js';
import {
  clearReplModalHandler,
  dispatchReplModalKey,
  registerReplModalHooks,
} from '../core/repl/repl-prompt-bridge.js';
import { restoreReplInput } from '../core/repl/restore-input.js';
import { askUserInRepl } from '../core/repl/ask-user.js';
import { getBackgroundManager } from '../core/agent/background-tasks.js';
import { printInlineDiffForPath } from '../core/staging/inline-diff.js';
import { getCliVersion } from '../utils/version.js';
import {
  resolveRenderer,
  shouldUseFullscreenRenderer,
  type RendererMode,
  type RendererShellOptions,
} from '../core/repl/renderer.js';
import { watchTtyResize, writeReplBlock, writeReplLine } from '../core/repl/viewport.js';

export type { ShellState } from './shell/types.js';
import type { ShellState } from './shell/types.js';

/** @internal test helper */
export function freshStateForTest(overrides: Partial<ShellState> = {}): ShellState {
  return {
    history: [],
    writeMode: 'staging',
    plan: createPlanState(),
    toolPermissionSession: new ToolPermissionSession(),
    ...overrides,
  };
}

export const SHELL_HELP_HEADER = `
Tip: plain text goes to the agent. Use @path/to/file to attach context.
Sensitive tools (bash, write_file, edit_file) prompt [y/n/a]. Tab completes /commands.
`.trim();

/** Backward-compat export for the existing shell.test.ts. */
export const SHELL_HELP = `
Commands:
  /help              Show this help
  /exit, /quit       Exit session
  /clear             Clear conversation history
  /refresh           Re-scan project context
  /auto [on|off]     Toggle direct-write mode (default: staging)
  /plan              Enter plan mode (read-only)
  /exit-plan [y]     Exit plan mode (y to apply the proposed plan)
  /diff              Show staged diff
  /apply             Apply staged changes (-y to skip confirm)
  /revert            Discard staging
  /doctor            Environment check
  /validate          Run project validation
  /model             Current model

Anything else is sent to the agent. Tool writes go through staging unless /auto is on.
`.trim();

async function buildWelcomeText(
  opts: GlobalOptions,
  state: ShellState,
  shellOpts: RunShellOptions = {},
): Promise<string> {
  const root = resolveProjectRoot(opts);
  const ctx = scanProjectContext(root);
  let modelLine = 'not set - /model use provider/model';
  try {
    const config = await loadMergedConfig(root);
    const resolved = resolveModelForTask(config, 'chat', {
      provider: opts.provider,
      model: opts.model,
    });
    modelLine = `${resolved.providerId}/${resolved.model}`;
    state.tokenUsage = buildTokenUsageSnapshot(config, resolved, state.history);
  } catch (e) {
    modelLine = e instanceof Error ? e.message : String(e);
  }

  const writeModeLabel = state.writeMode === 'direct' ? 'direct (auto-write)' : 'staging (safe)';

  return renderReplWelcome({
    showMascot: !shellOpts.noMascot && !isMascotDisabled(),
    info: {
      projectRoot: root,
      engine: ctx.engine,
      modelLine,
      writeModeLabel,
      version: getCliVersion(),
    },
  });
}

async function printBannerAsync(
  opts: GlobalOptions,
  state: ShellState,
  shellOpts: RunShellOptions = {},
): Promise<void> {
  writeReplBlock(await buildWelcomeText(opts, state, shellOpts));
}

function printReplFarewell(seed = 0): void {
  if (isMascotDisabled()) {
    console.log(chalk.dim('\n  Bye.'));
    return;
  }
  console.log('');
  console.log(renderGemiFarewellLine(pickGemiFarewell(seed)));
}

function buildToolConfirm(state: ShellState) {
  return async (req: { tool: string; argsSummary: string }): Promise<boolean> => {
    if (state.toolPermissionSession.isAlwaysAllowed(req.tool)) return true;
    const answer = await askToolConfirm(req);
    if (answer === 'allow-always') {
      state.toolPermissionSession.allowAlways(req.tool);
      return true;
    }
    return answer === 'allow';
  };
}

function onStagingToolCompleted(
  projectRoot: string,
  call: import('../core/agent/tool-dispatcher.js').DispatchedCall,
  writeMode: ToolWriteMode,
): void {
  if (writeMode !== 'staging' || call.result.isError) return;
  let rel = call.result.structured?.path;
  if (typeof rel !== 'string' && call.tool === 'stage_project_file') {
    try {
      const parsed = JSON.parse(call.result.content) as { staged?: string };
      rel = parsed.staged;
    } catch {
      /* ignore */
    }
  }
  if (typeof rel === 'string') {
    printInlineDiffForPath(projectRoot, rel);
  }
}

import { handleSlashImpl, type SlashHandled } from './shell/slash-handler.js';

async function handleSlash(
  line: string,
  opts: GlobalOptions,
  state: ShellState,
  registry: SlashRegistry,
): Promise<SlashHandled> {
  return handleSlashImpl(line, opts, state, registry);
}

/** Backward-compat alias for tests. */
export const _handleSlashImpl = handleSlashImpl;

export interface RunShellOptions extends RendererShellOptions {
  /** Start in direct-write mode (`spark-cli --auto` / `spark-cli chat --auto`). */
  auto?: boolean;
  /** Skip Spark mascot (also `SPARK_CLI_NO_MASCOT=1`). */
  noMascot?: boolean;
}

export type { RendererMode };

/** @deprecated use shouldUseFullscreenRenderer */
export const shouldUseInkShell = shouldUseFullscreenRenderer;

export { resolveRenderer, shouldUseFullscreenRenderer };

export interface ProcessReplLineResult {
  state: ShellState;
  shouldExit?: boolean;
  /** True when an agent turn was executed (not only slash short-circuit). */
  ranAgent?: boolean;
}

export function classifyInterrupt(
  hasActiveTurn: boolean,
  pendingSecondCtrlC: boolean,
): 'abort-turn' | 'exit-session' | 'warn-exit' {
  if (hasActiveTurn) return 'abort-turn';
  if (pendingSecondCtrlC) return 'exit-session';
  return 'warn-exit';
}

/**
 * Process one REPL line (slash command or agent turn). Exported for e2e tests.
 */
export async function processReplUserLine(
  line: string,
  opts: GlobalOptions,
  state: ShellState,
  registry: SlashRegistry,
): Promise<ProcessReplLineResult> {
  const trimmed = line.trim();
  if (!trimmed) return { state };

  let syntheticPrompt: { text: string; mode: 'normal' | 'plan' } | undefined;
  if (trimmed.startsWith('/')) {
    const slash = await handleSlash(trimmed, opts, state, registry);
    Object.assign(state, slash.state);
    if (slash.shouldExit) return { state, shouldExit: true };
    if (slash.handled && !slash.syntheticPrompt) return { state };
    syntheticPrompt = slash.syntheticPrompt;
  }

  const projectRoot = resolveProjectRoot(opts);
  const hookConfig = loadHookConfig(projectRoot);
  const isPlan = syntheticPrompt?.mode === 'plan' || isPlanMode(state.plan);
  const turnText = syntheticPrompt?.text ?? trimmed;

  runHooks(
    'pre_user_message',
    {
      event: 'pre_user_message',
      projectRoot,
      text: turnText,
      mode: isPlan ? 'plan' : 'normal',
    },
    projectRoot,
    { config: hookConfig },
  );

  const result = await runAgentTurnForCli({
    globalOpts: opts,
    history: state.history,
    userInput: turnText,
    writeMode: state.writeMode,
    mode: isPlan ? 'plan' : 'normal',
    agentId: `repl-test-${Date.now()}`,
  });

  state.history = result.history;
  if (isPlan && result.finalContent) {
    state.plan = recordPlanTurn(state.plan, turnText, result.finalContent);
  }

  if (result.finalContent && !opts.json) {
    console.log('\n' + result.finalContent + '\n');
  }

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

  return { state, ranAgent: true };
}

/** Construct a registry pre-loaded with built-ins and file-based commands. */
export function buildShellRegistry(projectRoot: string): SlashRegistry {
  const reg = createSlashRegistry();
  for (const cmd of buildBuiltinCommands()) reg.register(cmd);
  loadFileCommands(reg, projectRoot);
  return reg;
}

export async function runShell(
  opts: GlobalOptions,
  shellOpts: RunShellOptions = {},
): Promise<void> {
  const projectRoot = resolveProjectRoot(opts);
  const config = await loadMergedConfig(projectRoot);
  const rendererMode = resolveRenderer({
    ...shellOpts,
    configRenderer: config.ui?.renderer,
  });

  // Fullscreen renderer: Ink + alternate screen (opt-in only).
  if (rendererMode === 'fullscreen') {
    const { runInkRepl } = await import('../core/repl/ink-repl.js');
    return runInkRepl(opts, shellOpts);
  }

  // Initialize theme from saved config preference
  const { initThemeFromConfig } = await import('../theme/theme.js');
  initThemeFromConfig();

  // Default renderer: main terminal buffer — native scrollback, no alt screen.
  const persistPath = getAlwaysAllowPath(projectRoot);
  const toolPermissionSession = new ToolPermissionSession(persistPath);

  // Load or create session based on --continue/--resume flags
  let snapshot: SessionSnapshot | undefined;
  if (opts.resumeSession) {
    snapshot = loadSession(projectRoot, opts.resumeSession);
    if (!snapshot) {
      console.error(chalk.yellow(`Session ${opts.resumeSession} not found.`));
    }
  }
  if (!snapshot && opts.continueSession) {
    snapshot = findMostRecent(projectRoot);
  }

  const state: ShellState = snapshot
    ? {
        history: snapshot.history,
        writeMode: snapshot.writeMode as ToolWriteMode,
        plan: snapshot.plan as PlanState,
        toolPermissionSession,
        sessionId: snapshot.id,
        sessionTitle: snapshot.title,
      }
    : {
        history: [],
        writeMode: shellOpts.auto ? 'direct' : 'staging',
        plan: createPlanState(),
        toolPermissionSession,
      };

  // Create a new session if not resuming
  if (!state.sessionId) {
    const model = 'unknown'; // resolved later in buildWelcomeText
    const newSession = createSession(projectRoot, model);
    state.sessionId = newSession.id;
  }

  if (snapshot) {
    console.log(chalk.green(`Resumed session: ${snapshot.title || snapshot.id}`));
  }
  const registry = buildShellRegistry(projectRoot);
  await printBannerAsync(opts, state, shellOpts);
  writeReplLine('');
  let hookConfig = loadHookConfig(projectRoot);
  runHooks(
    'session_start',
    {
      event: 'session_start',
      projectRoot,
      writeMode: state.writeMode,
      startedAt: new Date().toISOString(),
    },
    projectRoot,
    { config: hookConfig },
  );

  const inputBox = new InputBox({
    completer: createSlashCompleter(registry),
    onRenderChrome: () => printInputBoxChrome(state, footerMessage),
  });
  const turnUi = {
    stopSpinner: (): void => {},
    restartSpinner: (): void => {},
  };
  registerReplModalHooks({
    onOpen: () => turnUi.stopSpinner(),
    onClose: () => {
      if (activeController) turnUi.restartSpinner();
    },
  });
  let activeController: AbortController | null = null;
  let pendingSecondCtrlC = false;
  let sessionClosed = false;
  let footerMessage: string | undefined;
  let unwatchResize: (() => void) | undefined;
  let layoutRerendering = false;

  const setFooterMessage = (message?: string): void => {
    footerMessage = message;
  };

  const clearFooterMessage = (): void => {
    footerMessage = undefined;
  };

  const sigintHandler = (): void => {
    const action = classifyInterrupt(Boolean(activeController), pendingSecondCtrlC);
    if (action === 'abort-turn') {
      activeController?.abort();
      activeController = null;
      printInterrupted();
      pendingSecondCtrlC = true;
      return;
    }
    if (action === 'exit-session') {
      if (inputBox.isVisible) inputBox.hide();
      sessionClosed = true;
      if (typeof input.setRawMode === 'function') input.setRawMode(false);
      return;
    }
    pendingSecondCtrlC = true;
    setFooterMessage('Ctrl-C again to exit');
    if (inputBox.isVisible) {
      inputBox.redraw();
    }
  };
  process.on('SIGINT', sigintHandler);

  /**
   * Claude Code闂傚倷鑳堕崑銊╁磿閺屻儱绠栭柣搴ｅ姇le Shift+Tab mode cycle: staging 闂?direct 闂?plan 闂?staging.
   */
  const cycleMode = (): void => {
    if (activeController) return;
    if (isPlanMode(state.plan)) {
      state.plan = cancelPlan(state.plan);
      state.writeMode = 'staging';
    } else if (state.writeMode === 'staging') {
      state.writeMode = 'direct';
    } else if (state.writeMode === 'direct') {
      state.writeMode = 'staging';
      state.plan = forceEnterPlan();
      runHooks('on_plan_enter', { event: 'on_plan_enter', projectRoot }, projectRoot, {
        config: hookConfig,
      });
    }
    if (inputBox.isVisible) {
      inputBox.redraw();
    }
  };

  const showPrompt = (): void => {
    pendingSecondCtrlC = false;
    clearFooterMessage();
    clearReplModalHandler();
    if (!inputBox.isVisible) {
      inputBox.show();
    }
  };

  /**
   * Default renderer: do not clear scrollback or replay history on resize.
   * Only refresh the input chrome so column width stays correct.
   */
  const rerenderLayout = async (): Promise<void> => {
    if (layoutRerendering || activeController || sessionClosed) return;
    layoutRerendering = true;
    try {
      if (inputBox.isVisible) {
        inputBox.redraw();
      }
    } finally {
      layoutRerendering = false;
    }
  };

  /**
   * Task 6.1: Made async to properly await rerenderLayout completion
   */
  const handleTerminalResize = async (): Promise<void> => {
    await rerenderLayout();
  };

  const runTurn = async (userInput: string, overrideMode?: 'normal' | 'plan'): Promise<void> => {
    hookConfig = loadHookConfig(projectRoot);

    const isPlan = overrideMode === 'plan' || (overrideMode !== 'normal' && isPlanMode(state.plan));
    runHooks(
      'pre_user_message',
      {
        event: 'pre_user_message',
        projectRoot,
        text: userInput,
        mode: isPlan ? 'plan' : 'normal',
      },
      projectRoot,
      { config: hookConfig },
    );
    if (!opts.json) {
      printUserTurn(userInput);
    }

    activeController = new AbortController();
    let thinkingSpinner: ThinkingSpinner | null = null;
    const stopThinkingSpinner = () => {
      thinkingSpinner?.stop();
      thinkingSpinner = null;
    };
    const restartThinkingSpinner = () => {
      if (opts.json || thinkingSpinner) return;
      thinkingSpinner = startThinkingSpinner('Concocting...');
    };
    turnUi.stopSpinner = stopThinkingSpinner;
    turnUi.restartSpinner = restartThinkingSpinner;
    restartThinkingSpinner();
    const expanded = expandAtReferences(projectRoot, userInput);
    if (expanded.refs.length > 0 && !opts.json) {
      stopThinkingSpinner();
      console.log(chalk.dim('  @ refs: ' + expanded.refs.map((r) => '@' + r).join(', ')));
      restartThinkingSpinner();
    }

    const result = await runAgentTurnForCli({
      globalOpts: opts,
      history: state.history,
      userInput,
      agentInput: expanded.agentText,
      writeMode: state.writeMode,
      mode: isPlan ? 'plan' : 'normal',
      agentId: `repl-${Date.now()}`,
      abortSignal: activeController.signal,
      expandAtRefs: false,
      toolPermissionSession: state.toolPermissionSession,
      confirmTool: buildToolConfirm(state),
      askUser: askUserInRepl,
      onToolCompleted: (call) => {
        onStagingToolCompleted(projectRoot, call, state.writeMode);
      },
      onIteration: (info) => {
        if (!opts.json && info.dispatched && info.dispatched.length > 0) {
          stopThinkingSpinner();
          printToolBatch(
            info.dispatched.map((d) => ({
              tool: d.tool,
              durationMs: d.durationMs,
              isError: Boolean(d.result.isError),
            })),
          );
          restartThinkingSpinner();
        }
      },
    }).finally(() => {
      activeController = null;
      stopThinkingSpinner();
    });
    state.history = result.history;

    // Update token usage for the mode line (always refresh; API usage preferred).
    const config = await loadMergedConfig(projectRoot);
    const resolved = resolveModelForTask(config, 'chat', {
      provider: opts.provider,
      model: opts.model,
    });
    state.tokenUsage = buildTokenUsageSnapshot(config, resolved, state.history, result.usage);

    if (isPlan && result.finalContent) {
      state.plan = recordPlanTurn(state.plan, userInput, result.finalContent);
    }

    // Auto-save session after each turn
    if (state.sessionId) {
      try {
        const snapshot: SessionSnapshot = {
          id: state.sessionId,
          projectRoot,
          history: state.history,
          messages: [],
          writeMode: state.writeMode,
          permissionMode: 'default',
          effortLevel: 'medium',
          alwaysAllowSet: [...state.toolPermissionSession.getAlwaysAllowSet()],
          plan: state.plan,
          model: resolved.model,
          title: state.sessionTitle || '',
          startedAt: '',
          updatedAt: '',
        };
        saveSession(projectRoot, snapshot);
      } catch {
        // Session save failures are non-critical
      }
    }

    if (result.stopReason === 'aborted') {
      // Interrupted message printed by SIGINT handler.
    } else if (result.finalContent) {
      if (!opts.json) {
        printAssistantBlock(result.finalContent);
        console.log('');
      }
      if (isPlan) {
        console.log(
          chalk.dim('  Plan recorded. Use /exit-plan y to apply, /exit-plan to cancel.\n'),
        );
      }
    } else if (result.stopReason === 'iteration_cap') {
      console.log(
        chalk.yellow(
          `Reached iteration cap (${result.iterations}). Refine the request and try again.\n`,
        ),
      );
    }

    if (result.stopReason !== 'aborted') {
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

      // Auto-extract memory facts in the background (non-blocking)
      if (state.history.length >= 2) {
        resolveCompletionFn(opts)
          .then(({ completeFn }) =>
            flushMemoryOnSessionEnd({
              projectRoot,
              history: state.history,
              completeFn,
            }),
          )
          .catch(() => {
            // Memory flush failures are non-critical
          });
      }
    }
  };

  const handleLine = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) {
      showPrompt();
      return;
    }

    try {
      let syntheticPrompt: { text: string; mode: 'normal' | 'plan' } | undefined;
      if (trimmed.startsWith('/')) {
        const slash = await handleSlash(trimmed, opts, state, registry);
        Object.assign(state, slash.state);
        if (slash.shouldExit) {
          sessionClosed = true;
          if (typeof input.setRawMode === 'function') input.setRawMode(false);
          return;
        }
        if (slash.handled && !slash.syntheticPrompt) {
          showPrompt();
          return;
        }
        syntheticPrompt = slash.syntheticPrompt;
      }

      const turnText = syntheticPrompt?.text ?? trimmed;
      const mode = syntheticPrompt?.mode;
      await runTurn(turnText, mode);
    } catch (e) {
      activeController = null;
      restoreReplInput(inputBox);
      if (e instanceof SparkCLIError) {
        printAssistantError(e.message);
        if (e.hints?.length) {
          for (const h of e.hints) console.log(chalk.dim('    ') + h);
        }
      } else {
        printAssistantError(e instanceof Error ? e.message : String(e));
      }
    }

    showPrompt();
  };

  // 闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞?Raw-mode key handler 闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚?
  if (typeof input.setRawMode === 'function' && input.isTTY) {
    input.setRawMode(true);
    readline.emitKeypressEvents(input);

    input.on('keypress', (chunk, key) => {
      if (sessionClosed) return;

      if (key?.ctrl && key.name === 'c') {
        sigintHandler();
        return;
      }

      if (pendingSecondCtrlC) {
        pendingSecondCtrlC = false;
        if (footerMessage) {
          clearFooterMessage();
          if (inputBox.isVisible) inputBox.redraw();
        }
      }

      if (dispatchReplModalKey(chunk, key ?? {})) {
        return;
      }

      // Shift+Tab — cycle mode
      if (key && key.name === 'tab' && key.shift) {
        cycleMode();
        return;
      }

      // If the input box is visible, delegate key handling to it
      if (inputBox.isVisible) {
        const submitted = inputBox.handleKey(chunk, key ?? {});
        if (submitted !== null) {
          // User pressed Enter 闂?submit the text
          handleLine(submitted);
        }
        return;
      }

      // If agent is running and user presses Escape, abort
      if (key?.name === 'escape' && activeController) {
        activeController.abort();
        activeController = null;
        printInterrupted();
        return;
      }

      // Esc+Esc — rewind to last checkpoint (when no agent is running)
      if (key?.name === 'escape' && !activeController && state.checkpoint) {
        (async () => {
          try {
            const { rewindToCheckpoint } = await import('../core/git/checkpoint.js');
            const ok = await rewindToCheckpoint(projectRoot, state.checkpoint!.id);
            if (ok) {
              console.log(chalk.green('Rewound to checkpoint:'), chalk.cyan(state.checkpoint!.id));
              state.checkpoint = undefined;
            } else {
              console.log(chalk.yellow('Rewind failed.'));
            }
          } catch (e) {
            console.error(chalk.red('Rewind error:'), e instanceof Error ? e.message : String(e));
          }
        })();
      }
    });
  }

  unwatchResize = watchTtyResize(handleTerminalResize, { debounceMs: 200 });

  // Show the initial input box
  showPrompt();

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (sessionClosed) {
        clearInterval(check);
        process.removeListener('SIGINT', sigintHandler);
        unwatchResize?.();
        unwatchResize = undefined;
        getBackgroundManager().stopAll();
        runHooks(
          'session_end',
          {
            event: 'session_end',
            projectRoot,
            endedAt: new Date().toISOString(),
          },
          projectRoot,
          { config: hookConfig },
        );
        resolve();
      }
    }, 100);
  });
  printReplFarewell(projectRoot.length);
}
