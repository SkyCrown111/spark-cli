import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SHELL_HELP,
  _handleSlashImpl,
  buildShellRegistry,
  classifyInterrupt,
  shouldUseInkShell,
  resolveRenderer,
  type ShellState,
} from './shell.js';
import type { GlobalOptions } from '../utils/output.js';
import type { SlashRegistry } from '../core/slash/registry.js';
import { createPlanState } from '../core/slash/plan-mode.js';
import { ToolPermissionSession } from '../core/agent/tool-permissions.js';

let projectRoot: string;
let registry: SlashRegistry;
let logSpy: ReturnType<typeof vi.spyOn>;

function freshState(overrides: Partial<ShellState> = {}): ShellState {
  return {
    history: [],
    writeMode: 'staging',
    plan: createPlanState(),
    toolPermissionSession: new ToolPermissionSession(),
    ...overrides,
  };
}

function opts(): GlobalOptions {
  return { project: projectRoot };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-shell-'));
  registry = buildShellRegistry(projectRoot);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('shell help', () => {
  it('exports help text covering core slash commands', () => {
    expect(SHELL_HELP).toContain('/apply');
    expect(SHELL_HELP).toContain('/diff');
    expect(SHELL_HELP).toContain('/auto');
    expect(SHELL_HELP).toContain('/refresh');
  });
});

describe('interrupt handling', () => {
  it('classifies ctrl-c during a turn as abort', () => {
    expect(classifyInterrupt(true, false)).toBe('abort-turn');
  });

  it('classifies second ctrl-c while idle as exit', () => {
    expect(classifyInterrupt(false, true)).toBe('exit-session');
  });

  it('classifies first idle ctrl-c as warning', () => {
    expect(classifyInterrupt(false, false)).toBe('warn-exit');
  });
});

describe('shell UI selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the main-screen renderer', () => {
    expect(shouldUseInkShell({})).toBe(false);
    expect(resolveRenderer({})).toBe('default');
  });

  it('enables fullscreen when renderer is set explicitly', () => {
    expect(shouldUseInkShell({ renderer: 'fullscreen' })).toBe(true);
  });

  it('keeps default renderer on explicit renderer selection', () => {
    expect(shouldUseInkShell({ renderer: 'default' })).toBe(false);
  });

  it('allows env opt-in for fullscreen renderer', () => {
    vi.stubEnv('SPARK_CLI_NO_FLICKER', '1');
    expect(shouldUseInkShell({})).toBe(true);
  });

  it('lets explicit default override env opt-in', () => {
    vi.stubEnv('SPARK_CLI_RENDERER', 'fullscreen');
    expect(shouldUseInkShell({ renderer: 'default' })).toBe(false);
  });

  it('supports fullscreen flag as renderer alias', () => {
    expect(shouldUseInkShell({ fullscreen: true })).toBe(true);
  });

  it('lets --no-ink compatibility flag override legacy env opt-in', () => {
    vi.stubEnv('SPARK_CLI_INK', '1');
    expect(shouldUseInkShell({ noInk: true })).toBe(false);
  });

  it('uses config ui.renderer when CLI is silent', () => {
    expect(shouldUseInkShell({ configRenderer: 'fullscreen' })).toBe(true);
  });
});

describe('slash dispatcher', () => {
  it('passes through plain prose', async () => {
    const r = await _handleSlashImpl('hello there', opts(), freshState(), registry);
    expect(r.handled).toBe(false);
  });

  it('handles /help', async () => {
    const r = await _handleSlashImpl('/help', opts(), freshState(), registry);
    expect(r.handled).toBe(true);
    expect(r.shouldExit).toBeFalsy();
  });

  it('handles /exit by signaling shouldExit', async () => {
    const r = await _handleSlashImpl('/exit', opts(), freshState(), registry);
    expect(r.handled).toBe(true);
    expect(r.shouldExit).toBe(true);
  });

  it('clears conversation history on /clear', async () => {
    const state = freshState({
      history: [{ role: 'user', content: 'old' }],
    });
    const r = await _handleSlashImpl('/clear', opts(), state, registry);
    expect(r.handled).toBe(true);
    expect(r.state.history).toEqual([]);
  });

  it('toggles writeMode on /auto', async () => {
    let state = freshState({ writeMode: 'staging' });
    let r = await _handleSlashImpl('/auto', opts(), state, registry);
    expect(r.handled).toBe(true);
    expect(r.state.writeMode).toBe('direct');

    state = r.state;
    r = await _handleSlashImpl('/auto', opts(), state, registry);
    expect(r.state.writeMode).toBe('staging');
  });

  it('forces writeMode with /auto on / off', async () => {
    let r = await _handleSlashImpl('/auto on', opts(), freshState(), registry);
    expect(r.state.writeMode).toBe('direct');

    r = await _handleSlashImpl('/auto off', opts(), freshState({ writeMode: 'direct' }), registry);
    expect(r.state.writeMode).toBe('staging');
  });

  it('case-insensitive matching of slash commands', async () => {
    const r = await _handleSlashImpl('/HELP', opts(), freshState(), registry);
    expect(r.handled).toBe(true);
  });

  it('preserves writeMode when handling /clear', async () => {
    const state = freshState({ writeMode: 'direct' });
    const r = await _handleSlashImpl('/clear', opts(), state, registry);
    expect(r.state.writeMode).toBe('direct');
  });

  it('enters plan mode on /plan', async () => {
    const r = await _handleSlashImpl('/plan', opts(), freshState(), registry);
    expect(r.handled).toBe(true);
    expect(r.state.plan.phase).toBe('plan');
  });

  it('cancels plan mode on bare /exit-plan', async () => {
    const state = freshState({ plan: { phase: 'plan' } });
    const r = await _handleSlashImpl('/exit-plan', opts(), state, registry);
    expect(r.handled).toBe(true);
    expect(r.state.plan.phase).toBe('normal');
    expect(r.syntheticPrompt).toBeUndefined();
  });

  it('warns and exits plan mode when /exit-plan y has no recorded plan', async () => {
    const state = freshState({ plan: { phase: 'plan' } });
    const r = await _handleSlashImpl('/exit-plan y', opts(), state, registry);
    expect(r.handled).toBe(true);
    expect(r.state.plan.phase).toBe('normal');
    expect(r.syntheticPrompt).toBeUndefined();
  });

  it('approves plan via /exit-plan y with synthetic replay', async () => {
    const state = freshState({
      plan: {
        phase: 'plan',
        lastUserIntent: 'refactor login',
        lastPlanText: 'plan body',
      },
    });
    const r = await _handleSlashImpl('/exit-plan yes', opts(), state, registry);
    expect(r.handled).toBe(true);
    expect(r.state.plan.phase).toBe('normal');
    expect(r.syntheticPrompt).toEqual({ text: 'refactor login', mode: 'normal' });
  });
});
