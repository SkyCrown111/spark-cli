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
 *   `loadFileCommands()` for `.spark-cli/commands/*.md`.
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
import type { ChatMessage } from '../core/providers/openai-compatible.js';
import { runAgentTurnForCli } from '../core/agent/run-turn.js';
import type { ToolWriteMode } from '../core/agent/tool-registry.js';
import { SparkCLIError } from '../utils/errors.js';
import {
  createSlashRegistry,
  type SlashRegistry,
} from '../core/slash/registry.js';
import { buildBuiltinCommands } from '../core/slash/built-ins.js';
import type { ExtendedOutcome } from '../core/slash/built-ins.js';
import { loadFileCommands } from '../core/slash/loader.js';
import {
  approvePlan,
  cancelPlan,
  createPlanState,
  enterPlan,
  forceEnterPlan,
  isPlanMode,
  recordPlanTurn,
  requestApproval,
  type PlanState,
} from '../core/slash/plan-mode.js';
import { runHooks } from '../core/hooks/runner.js';
import { loadHookConfig } from '../core/hooks/config.js';
import { compactHistory } from '../core/context/compaction.js';
import { resolveCompletionFn } from '../core/agent/run-turn.js';
import { appendReplayEvent } from '../core/replay/log.js';
import { expandAtReferences } from '../core/repl/at-refs.js';
import {
  createSlashCompleter,
} from '../core/repl/repl-ui.js';
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
import {
  isMascotDisabled,
  pickGemiFarewell,
  renderGemiFarewellLine,
} from '../core/repl/mascot.js';
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
  clearTtyViewport,
  shouldUseAlternateScreen,
  watchTtyResize,
  writeReplBlock,
  writeReplLine,
} from '../core/repl/viewport.js';

export interface ShellState {
  history: ChatMessage[];
  writeMode: ToolWriteMode;
  plan: PlanState;
  toolPermissionSession: ToolPermissionSession;
  /** Token usage info for the status line. */
  tokenUsage?: { used: number; budget: number };
  /** Current session ID for persistence. */
  sessionId?: string;
  /** Session title (derived from first user message). */
  sessionTitle?: string;
  /** Current checkpoint for rewind. */
  checkpoint?: { id: string; timestamp: string };
}

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

function renderHelp(registry: SlashRegistry): string {
  const cmds = registry.list();
  const max = cmds.length > 0 ? Math.max(...cmds.map((c) => c.name.length)) : 0;
  const lines = ['', SHELL_HELP_HEADER, '', 'Commands:'];
  for (const c of cmds) {
    const tag =
      c.source === 'project'
        ? chalk.dim(' (project)')
        : c.source === 'user'
          ? chalk.dim(' (user)')
          : '';
    lines.push(`  /${c.name.padEnd(max)}  ${c.description}${tag}`);
  }
  return lines.join('\n');
}

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

  const writeModeLabel =
    state.writeMode === 'direct' ? 'direct (auto-write)' : 'staging (safe)';

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

function enterAlternateScreen(): boolean {
  if (!shouldUseAlternateScreen()) return false;
  // Keep the caret visible — InputBox positions the terminal cursor for editing.
  process.stdout.write('\x1b[?1049h\x1b[?25h');
  clearTtyViewport();
  return true;
}

function leaveAlternateScreen(enabled: boolean): void {
  if (!enabled || !process.stdout.isTTY) return;
  process.stdout.write('\x1b[?25h\x1b[?1049l');
}

function renderHistory(history: ChatMessage[]): void {
  for (const message of history) {
    if (message.role === 'user' && typeof message.content === 'string') {
      printUserTurn(message.content);
      continue;
    }
    if (message.role === 'assistant' && typeof message.content === 'string' && message.content.trim()) {
      printAssistantBlock(message.content);
      writeReplLine('');
    }
  }
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

interface SlashHandled {
  state: ShellState;
  handled: boolean;
  shouldExit?: boolean;
  /** Synthetic prompt the dispatcher wants the REPL to run as the next turn. */
  syntheticPrompt?: { text: string; mode: 'normal' | 'plan' };
}

async function handleSlash(
  line: string,
  opts: GlobalOptions,
  state: ShellState,
  registry: SlashRegistry,
): Promise<SlashHandled> {
  return _handleSlashImpl(line, opts, state, registry);
}

/** Exposed for unit tests. */
export async function _handleSlashImpl(
  line: string,
  opts: GlobalOptions,
  state: ShellState,
  registry: SlashRegistry,
): Promise<SlashHandled> {
  const trimmed = line.trim();
  if (trimmed === '/help' || trimmed === '/?') {
    console.log(renderHelp(registry));
    return { state, handled: true };
  }

  const outcome = (await registry.dispatch(trimmed, opts)) as ExtendedOutcome | { kind: 'unknown' };
  if (outcome.kind === 'unknown') return { state, handled: false };

  if (outcome.kind === 'handled') return { state, handled: true };
  if (outcome.kind === 'exit') return { state, handled: true, shouldExit: true };

  if (outcome.kind === 'enter-plan') {
    if (isPlanMode(state.plan)) {
      console.log(chalk.dim('Already in plan mode.'));
      return { state, handled: true };
    }
    console.log(chalk.cyan('Plan mode engaged. The agent runs read-only.'));
    console.log(chalk.dim('  Use /exit-plan y to approve, /exit-plan to cancel.'));
    appendReplayEvent(resolveProjectRoot(opts), 'plan_enter', {});
    const planRoot = resolveProjectRoot(opts);
    runHooks(
      'on_plan_enter',
      { event: 'on_plan_enter', projectRoot: planRoot },
      planRoot,
      { config: loadHookConfig(planRoot) },
    );
    return {
      state: { ...state, plan: enterPlan(state.plan) },
      handled: true,
    };
  }

  if (outcome.kind === 'exit-plan') {
    if (state.plan.phase === 'normal') {
      console.log(chalk.dim('Not in plan mode.'));
      return { state, handled: true };
    }
    if (outcome.approve) {
      const pending = requestApproval(state.plan);
      if (!pending) {
        console.log(
          chalk.yellow('No plan to apply yet. Describe the task in plan mode first.'),
        );
        return {
          state: { ...state, plan: cancelPlan(state.plan) },
          handled: true,
        };
      }
      const approved = approvePlan(pending);
      if (!approved) {
        return {
          state: { ...state, plan: cancelPlan(state.plan) },
          handled: true,
        };
      }
      console.log(chalk.green('OK Plan approved. Re-running in normal mode...'));
      const planRoot = resolveProjectRoot(opts);
      appendReplayEvent(planRoot, 'plan_exit', { approved: true });
      runHooks(
        'on_plan_exit',
        { event: 'on_plan_exit', projectRoot: planRoot, approved: true },
        planRoot,
        { config: loadHookConfig(planRoot) },
      );
      return {
        state: { ...state, plan: approved.next },
        handled: true,
        syntheticPrompt: { text: approved.intent, mode: 'normal' },
      };
    }
    console.log(chalk.dim('Plan cancelled.'));
    const planRoot = resolveProjectRoot(opts);
    appendReplayEvent(planRoot, 'plan_exit', { approved: false });
    runHooks(
      'on_plan_exit',
      { event: 'on_plan_exit', projectRoot: planRoot, approved: false },
      planRoot,
      { config: loadHookConfig(planRoot) },
    );
    return {
      state: { ...state, plan: cancelPlan(state.plan) },
      handled: true,
    };
  }

  // Handle the sentinel state mutation outcomes from built-ins.
  if (outcome.kind === 'state-clear-history') {
    return { state: { ...state, history: [] }, handled: true };
  }
  if (outcome.kind === 'state-set-write-mode') {
    const requested = outcome.writeMode as 'staging' | 'direct' | 'toggle';
    let next: ToolWriteMode;
    if (requested === 'direct' || requested === 'staging') {
      next = requested;
    } else {
      next = state.writeMode === 'direct' ? 'staging' : 'direct';
    }
    console.log(
      chalk.dim('write-mode:'),
      next === 'direct' ? chalk.yellow('direct (auto)') : chalk.cyan('staging'),
    );
    if (next === 'direct') {
      console.log(
        chalk.dim('  Tools now write directly to the project tree. /revert is unavailable.'),
      );
    }
    return { state: { ...state, writeMode: next }, handled: true };
  }

  if (outcome.kind === 'state-set-effort') {
    try {
      const { appState } = await import('../state/AppState.js');
      appState.setState({ effortLevel: outcome.effortLevel });
    } catch {
      // CLI-only mode: store locally for next turn
    }
    return { state, handled: true };
  }

  if (outcome.kind === 'state-show-model-picker') {
    // Ink REPL handles this via AppState; in CLI mode just show current
    try {
      const { appState } = await import('../state/AppState.js');
      appState.setState({ showModelPicker: true });
    } catch {
      // Fallback: just show current model
      const root = resolveProjectRoot(opts);
      const cfg = await loadMergedConfig(root);
      const resolved = resolveModelForTask(cfg, 'chat', {
        provider: opts.provider,
        model: opts.model,
      });
      console.log(chalk.dim('Current model:'), resolved);
    }
    return { state, handled: true };
  }

  if (outcome.kind === 'state-show-theme-picker') {
    // Ink REPL handles this via AppState; in CLI mode just list themes
    try {
      const { appState } = await import('../state/AppState.js');
      appState.setState({ showThemePicker: true });
    } catch {
      const { listThemes: listT } = await import('../theme/theme.js');
      const available = listT().join(', ');
      console.log(chalk.dim(`Available themes: ${available}`));
    }
    return { state, handled: true };
  }

  if (outcome.kind === 'state-show-status') {
    const root = resolveProjectRoot(opts);
    const cfg = await loadMergedConfig(root);
    const resolved = resolveModelForTask(cfg, 'chat', {
      provider: opts.provider,
      model: opts.model,
    });
    const snap = buildTokenUsageSnapshot(cfg, resolved, state.history);
    const pct = snap.budget > 0 ? Math.round((snap.used / snap.budget) * 100) : 0;
    console.log(chalk.dim('messages:'), state.history.length);
    console.log(chalk.dim('tokens:'), `${snap.used} / ${snap.budget}`, chalk.dim(`(${pct}%)`));
    console.log(
      chalk.dim('write-mode:'),
      state.writeMode === 'direct' ? chalk.yellow('direct (auto)') : chalk.cyan('staging'),
    );
    console.log(
      chalk.dim('plan-phase:'),
      state.plan.phase,
    );
    return { state, handled: true };
  }

  if (outcome.kind === 'state-compact-history') {
    if (state.history.length < 4) {
      console.log(chalk.dim('History too short to compact.'));
      return { state, handled: true };
    }
    try {
      const { completeFn } = await resolveCompletionFn(opts);
      const before = state.history.length;
      const { history: compacted, summary, compactedCount } = await compactHistory(
        state.history,
        { completeFn },
      );
      const after = compacted.length;
      console.log(
        chalk.green('OK'),
        chalk.dim(`compacted ${compactedCount} messages (${before} -> ${after})`),
      );
      if (summary) {
        const preview = summary.slice(0, 200);
        console.log(chalk.dim('  summary: ' + preview + (summary.length > 200 ? '...' : '')));
      }
      appendReplayEvent(resolveProjectRoot(opts), 'compaction', {
        agentId: 'repl',
        before,
        after,
        compactedCount,
        summaryPreview: summary.slice(0, 200),
        reason: 'manual',
      });
      const compactRoot = resolveProjectRoot(opts);
      runHooks(
        'on_compaction',
        {
          event: 'on_compaction',
          projectRoot: compactRoot,
          agentId: 'repl',
          before,
          after,
          compactedCount,
          reason: 'manual',
        },
        compactRoot,
        { config: loadHookConfig(compactRoot) },
      );
      return { state: { ...state, history: compacted }, handled: true };
    } catch (e) {
      console.error(
        chalk.red('ERROR'),
        'compaction failed:',
        e instanceof Error ? e.message : String(e),
      );
      return { state, handled: true };
    }
  }

  if (outcome.kind === 'prompt') {
    return {
      state,
      handled: true,
      syntheticPrompt: {
        text: outcome.text,
        mode: outcome.mode === 'plan' ? 'plan' : 'normal',
      },
    };
  }

  if (outcome.kind === 'state-resume-session') {
    const root = resolveProjectRoot(opts);
    const targetId = outcome.sessionId;
    let loaded: SessionSnapshot | undefined;
    if (targetId) {
      loaded = loadSession(root, targetId);
      if (!loaded) {
        console.log(chalk.yellow(`Session ${targetId} not found.`));
        return { state, handled: true };
      }
    } else {
      loaded = findMostRecent(root);
      if (!loaded) {
        console.log(chalk.dim('No sessions to resume.'));
        return { state, handled: true };
      }
    }
    console.log(chalk.green(`Resumed session: ${loaded.title || loaded.id}`));
    return {
      state: {
        ...state,
        history: loaded.history,
        writeMode: loaded.writeMode as ToolWriteMode,
        plan: loaded.plan as PlanState,
        sessionId: loaded.id,
        sessionTitle: loaded.title,
      },
      handled: true,
    };
  }

  return { state, handled: true };
}

export interface RunShellOptions {
  /** Start in direct-write mode (`spark-cli --auto` / `spark-cli chat --auto`). */
  auto?: boolean;
  /** Skip Spark mascot (also `SPARK_CLI_NO_MASCOT=1`). */
  noMascot?: boolean;
  /** Use Ink-based React UI (experimental). */
  ink?: boolean;
}

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
  // Delegate to Ink-based REPL when --ink flag is set
  if (shellOpts.ink) {
    const { runInkRepl } = await import('../core/repl/ink-repl.js');
    return runInkRepl(opts, shellOpts);
  }

  // Initialize theme from saved config preference
  const { initThemeFromConfig } = await import('../theme/theme.js');
  initThemeFromConfig();

  const useAlternateScreen = enterAlternateScreen();
  const projectRoot = resolveProjectRoot(opts);
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
      runHooks(
        'on_plan_enter',
        { event: 'on_plan_enter', projectRoot },
        projectRoot,
        { config: hookConfig },
      );
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
   * Full layout refresh after terminal resize (welcome uses new column width).
   * 
   * Fixed to prevent duplicate rendering:
   * - Task 4.1: Atomic flag check-and-set at function start
   * - Task 4.2: Try-finally block to ensure flag reset
   * - Task 5.1: Call suspendForRerender BEFORE clearTtyViewport
   * - Task 5.2: Ensure complete viewport clear including InputBox chrome
   * - Task 5.3: Call resumeAfterRerender AFTER all content redrawn
   */
  const rerenderLayout = async (): Promise<void> => {
    // Task 4.1: Atomic check-and-set at the very start (synchronous, before any async)
    if (layoutRerendering || activeController || sessionClosed) return;
    layoutRerendering = true;
    
    // Task 4.2: Wrap in try-finally to ensure flag is always reset
    try {
      // Task 5.1: Suspend InputBox BEFORE clearing viewport
      const inputDraft = inputBox.isVisible ? inputBox.suspendForRerender() : undefined;
      
      // Task 5.2: Complete viewport clear (clears screen and homes cursor)
      clearTtyViewport();
      
      // Redraw welcome banner and history
      writeReplBlock(await buildWelcomeText(opts, state, shellOpts));
      renderHistory(state.history);
      
      // Task 5.3: Resume InputBox AFTER all content is redrawn
      if (inputDraft) {
        inputBox.resumeAfterRerender(inputDraft);
      }
    } finally {
      // Task 4.2: Always reset flag, even if error occurs
      layoutRerendering = false;
    }
  };

  /** 
   * Task 6.1: Made async to properly await rerenderLayout completion
   */
  const handleTerminalResize = async (): Promise<void> => {
    await rerenderLayout();
  };

  const runTurn = async (
    userInput: string,
    overrideMode?: 'normal' | 'plan',
  ): Promise<void> => {
    hookConfig = loadHookConfig(projectRoot);

    const isPlan =
      overrideMode === 'plan' ||
      (overrideMode !== 'normal' && isPlanMode(state.plan));
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
      console.log(
        chalk.dim('  @ refs: ' + expanded.refs.map((r) => '@' + r).join(', ')),
      );
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
    state.tokenUsage = buildTokenUsageSnapshot(
      config,
      resolved,
      state.history,
      result.usage,
    );

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
  leaveAlternateScreen(useAlternateScreen);
  printReplFarewell(projectRoot.length);
}



