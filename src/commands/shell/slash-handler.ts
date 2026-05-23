/**
 * Slash command handler — processes stateful outcomes from built-in commands.
 *
 * Extracted from shell.ts to keep the REPL loop focused on I/O.
 */

import chalk from 'chalk';
import type { GlobalOptions } from '../../utils/output.js';
import { resolveProjectRoot } from '../../utils/output.js';
import { loadMergedConfig } from '../../config/load.js';
import { resolveModelForTask } from '../../core/providers/router.js';
import { buildTokenUsageSnapshot } from '../../core/context/token-usage.js';
import type { SlashRegistry } from '../../core/slash/registry.js';
import type { ExtendedOutcome } from '../../core/slash/built-ins.js';
import {
  approvePlan,
  cancelPlan,
  enterPlan,
  isPlanMode,
  requestApproval,
  type PlanState,
} from '../../core/slash/plan-mode.js';
import { runHooks } from '../../core/hooks/runner.js';
import { loadHookConfig } from '../../core/hooks/config.js';
import { compactHistory } from '../../core/context/compaction.js';
import { resolveCompletionFn } from '../../core/agent/run-turn.js';
import { appendReplayEvent } from '../../core/replay/log.js';
import { loadSession, findMostRecent, type SessionSnapshot } from '../../core/session/manager.js';
import { loadGlobalConfig, saveGlobalConfig } from '../../config/load.js';
import type { ToolWriteMode } from '../../core/agent/tool-registry.js';
import type { ShellState } from './types.js';

export interface SlashHandled {
  state: ShellState;
  handled: boolean;
  shouldExit?: boolean;
  /** Synthetic prompt the dispatcher wants the REPL to run as the next turn. */
  syntheticPrompt?: { text: string; mode: 'normal' | 'plan' };
}

function renderHelp(registry: SlashRegistry): string {
  const cmds = registry.list();
  const max = cmds.length > 0 ? Math.max(...cmds.map((c) => c.name.length)) : 0;
  const lines = [
    '',
    'Tip: plain text goes to the agent. Use @path/to/file to attach context.',
    'Sensitive tools (bash, write_file, edit_file) prompt [y/n/a]. Tab completes /commands.',
    '',
    'Commands:',
  ];
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

export async function handleSlashImpl(
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
    runHooks('on_plan_enter', { event: 'on_plan_enter', projectRoot: planRoot }, planRoot, {
      config: loadHookConfig(planRoot),
    });
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
        console.log(chalk.yellow('No plan to apply yet. Describe the task in plan mode first.'));
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
  if (outcome.kind === 'state-set-renderer') {
    const global = loadGlobalConfig();
    saveGlobalConfig({
      ...global,
      ui: { ...global.ui, renderer: outcome.renderer },
    });
    console.log(
      chalk.dim(`Renderer preference saved: ${outcome.renderer}. Restart spark-cli to apply.`),
    );
    return { state, handled: true };
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
      const { appState } = await import('../../state/AppState.js');
      appState.setState({ effortLevel: outcome.effortLevel });
    } catch {
      // CLI-only mode: store locally for next turn
    }
    return { state, handled: true };
  }

  if (outcome.kind === 'state-show-model-picker') {
    try {
      const { appState } = await import('../../state/AppState.js');
      appState.setState({ showModelPicker: true });
    } catch {
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
    try {
      const { appState } = await import('../../state/AppState.js');
      appState.setState({ showThemePicker: true });
    } catch {
      const { listThemes: listT } = await import('../../theme/theme.js');
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
    console.log(chalk.dim('plan-phase:'), state.plan.phase);
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
      const {
        history: compacted,
        summary,
        compactedCount,
      } = await compactHistory(state.history, { completeFn });
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
