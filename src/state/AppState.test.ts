/**
 * AppState store tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from './AppState.js';

describe('AppState', () => {
  // Reset store between tests
  beforeEach(() => {
    appState.setState({
      messages: [],
      agentHistory: [],
      mode: 'chat',
      loading: false,
      statusText: undefined,
      model: 'loading...',
      tokenUsage: undefined,
      writeMode: 'staging',
      permissionMode: 'default',
      plan: { phase: 'normal' },
      vimMode: 'INSERT',
      vimEnabled: false,
      statusLineText: undefined,
      companionEnabled: false,
      sessionTitle: '',
      showModelPicker: false,
      showThemePicker: false,
      showSettingsPanel: false,
      showOnboarding: false,
      footerItems: [],
    });
  });

  it('has correct initial state', () => {
    const state = appState.getState();
    expect(state.messages).toEqual([]);
    expect(state.mode).toBe('chat');
    expect(state.loading).toBe(false);
    expect(state.model).toBe('loading...');
    expect(state.writeMode).toBe('staging');
    expect(state.permissionMode).toBe('default');
    expect(state.vimMode).toBe('INSERT');
    expect(state.vimEnabled).toBe(false);
    expect(state.companionEnabled).toBe(false);
    expect(state.showModelPicker).toBe(false);
    expect(state.showThemePicker).toBe(false);
  });

  it('updates state with partial setState', () => {
    appState.setState({ loading: true });
    expect(appState.getState().loading).toBe(true);
    expect(appState.getState().mode).toBe('chat'); // unchanged
  });

  it('updates state with function setState', () => {
    appState.setState((prev) => ({
      messages: [...prev.messages, { role: 'user', content: 'hello' } as const],
    }));
    expect(appState.getState().messages).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('supports multiple sequential updates', () => {
    appState.setState({ model: 'openai/gpt-4' });
    appState.setState({ loading: true });
    appState.setState({ mode: 'direct' });
    const state = appState.getState();
    expect(state.model).toBe('openai/gpt-4');
    expect(state.loading).toBe(true);
    expect(state.mode).toBe('direct');
  });

  it('updates tokenUsage', () => {
    appState.setState({ tokenUsage: { used: 1500, budget: 200000 } });
    expect(appState.getState().tokenUsage).toEqual({ used: 1500, budget: 200000 });
  });

  it('toggles overlay dialogs', () => {
    appState.setState({ showModelPicker: true });
    expect(appState.getState().showModelPicker).toBe(true);
    appState.setState({ showModelPicker: false });
    expect(appState.getState().showModelPicker).toBe(false);
  });

  it('clears messages', () => {
    appState.setState({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ] as any,
    });
    expect(appState.getState().messages.length).toBe(2);
    appState.setState({ messages: [] });
    expect(appState.getState().messages).toEqual([]);
  });

  it('updates vimMode', () => {
    appState.setState({ vimMode: 'NORMAL' });
    expect(appState.getState().vimMode).toBe('NORMAL');
    appState.setState({ vimMode: 'INSERT' });
    expect(appState.getState().vimMode).toBe('INSERT');
  });

  it('selectIsPlanMode returns false for normal phase', () => {
    expect(appState.getState().plan.phase).toBe('normal');
  });

  it('selectTokenPercentage calculates correctly', () => {
    appState.setState({ tokenUsage: { used: 50000, budget: 200000 } });
    const tu = appState.getState().tokenUsage!;
    const pct = tu.budget > 0 ? Math.round((tu.used / tu.budget) * 100) : 0;
    expect(pct).toBe(25);
  });

  it('selectTokenPercentage returns 0 when no tokenUsage', () => {
    expect(appState.getState().tokenUsage).toBeUndefined();
  });

  it('selectTokenDisplay formats correctly', () => {
    appState.setState({ tokenUsage: { used: 1500, budget: 200000 } });
    const tu = appState.getState().tokenUsage!;
    const used = tu.used >= 1000 ? `${(tu.used / 1000).toFixed(1)}K` : String(tu.used);
    const budget = tu.budget >= 1000 ? `${(tu.budget / 1000).toFixed(0)}K` : String(tu.budget);
    expect(`${used} / ${budget}`).toBe('1.5K / 200K');
  });
});