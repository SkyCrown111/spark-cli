/**
 * Keybinding system tests — parser, match, resolver, and validation.
 */

import { describe, it, expect } from 'vitest';
import { parseKeyCombo, parseKeySequence, isChord } from './parser.js';
import { inkEventToKeyCombo, matchesKeyCombo, findMatchingAction } from './match.js';
import { KeybindingResolver } from './resolver.js';
import { isReserved } from './reservedShortcuts.js';
import { validateUserBindings } from './validate.js';
import { getDefaultKeybindings, getAllActions } from './defaultBindings.js';

// ── Parser tests ───────────────────────────────────────

describe('parseKeyCombo', () => {
  it('parses simple key', () => {
    const combo = parseKeyCombo('enter');
    expect(combo.key).toBe('enter');
    expect(combo.ctrl).toBe(false);
    expect(combo.shift).toBe(false);
    expect(combo.meta).toBe(false);
  });

  it('parses ctrl+key', () => {
    const combo = parseKeyCombo('ctrl+c');
    expect(combo.key).toBe('c');
    expect(combo.ctrl).toBe(true);
  });

  it('parses shift+key', () => {
    const combo = parseKeyCombo('shift+tab');
    expect(combo.key).toBe('tab');
    expect(combo.shift).toBe(true);
  });

  it('parses meta+key', () => {
    const combo = parseKeyCombo('meta+p');
    expect(combo.key).toBe('p');
    expect(combo.meta).toBe(true);
  });

  it('parses multi-modifier combo', () => {
    const combo = parseKeyCombo('ctrl+shift+c');
    expect(combo.key).toBe('c');
    expect(combo.ctrl).toBe(true);
    expect(combo.shift).toBe(true);
  });

  it('normalizes aliases', () => {
    const combo = parseKeyCombo('return');
    expect(combo.key).toBe('enter');
  });

  it('throws on invalid combo', () => {
    expect(() => parseKeyCombo('ctrl+')).toThrow('no key specified');
  });
});

describe('parseKeySequence', () => {
  it('parses single combo', () => {
    const seq = parseKeySequence({ key: 'ctrl+c', action: 'app:interrupt' });
    expect(seq.combos.length).toBe(1);
    expect(seq.action).toBe('app:interrupt');
  });

  it('parses chord sequence', () => {
    const seq = parseKeySequence({ key: 'ctrl+x ctrl+k', action: 'test:chord' });
    expect(seq.combos.length).toBe(2);
    expect(isChord(seq)).toBe(true);
  });
});

// ── Match tests ────────────────────────────────────────

describe('inkEventToKeyCombo', () => {
  it('converts enter key', () => {
    const combo = inkEventToKeyCombo('', { return: true });
    expect(combo.key).toBe('enter');
  });

  it('converts ctrl+c', () => {
    const combo = inkEventToKeyCombo('c', { ctrl: true });
    expect(combo.key).toBe('c');
    expect(combo.ctrl).toBe(true);
  });

  it('converts shift+tab', () => {
    const combo = inkEventToKeyCombo('', { tab: true, shift: true });
    expect(combo.key).toBe('tab');
    expect(combo.shift).toBe(true);
  });

  it('converts escape', () => {
    const combo = inkEventToKeyCombo('', { escape: true });
    expect(combo.key).toBe('escape');
  });

  it('converts pageup', () => {
    const combo = inkEventToKeyCombo('', { pageUp: true });
    expect(combo.key).toBe('pageup');
  });
});

describe('matchesKeyCombo', () => {
  it('matches exact combo', () => {
    const event = { key: 'c', ctrl: true, shift: false, meta: false };
    const binding = { key: 'c', ctrl: true, shift: false, meta: false };
    expect(matchesKeyCombo(event, binding)).toBe(true);
  });

  it('rejects mismatched key', () => {
    const event = { key: 'd', ctrl: true, shift: false, meta: false };
    const binding = { key: 'c', ctrl: true, shift: false, meta: false };
    expect(matchesKeyCombo(event, binding)).toBe(false);
  });

  it('rejects mismatched modifier', () => {
    const event = { key: 'c', ctrl: false, shift: false, meta: false };
    const binding = { key: 'c', ctrl: true, shift: false, meta: false };
    expect(matchesKeyCombo(event, binding)).toBe(false);
  });
});

describe('findMatchingAction', () => {
  it('finds matching action', () => {
    const sequences = [
      { combos: [{ key: 'c', ctrl: true, shift: false, meta: false }], action: 'app:interrupt' },
    ];
    const event = { key: 'c', ctrl: true, shift: false, meta: false };
    expect(findMatchingAction(event, sequences)).toBe('app:interrupt');
  });

  it('returns undefined when no match', () => {
    const sequences = [
      { combos: [{ key: 'c', ctrl: true, shift: false, meta: false }], action: 'app:interrupt' },
    ];
    const event = { key: 'd', ctrl: true, shift: false, meta: false };
    expect(findMatchingAction(event, sequences)).toBeUndefined();
  });
});

// ── Resolver tests ─────────────────────────────────────

describe('KeybindingResolver', () => {
  it('resolves global bindings', () => {
    const resolver = new KeybindingResolver();
    const event = { key: 'c', ctrl: true, shift: false, meta: false };
    expect(resolver.resolve(event)).toBe('app:interrupt');
  });

  it('resolves context-specific bindings', () => {
    const resolver = new KeybindingResolver();
    resolver.pushContext('Autocomplete');
    const tabEvent = { key: 'tab', ctrl: false, shift: false, meta: false };
    expect(resolver.resolve(tabEvent)).toBe('autocomplete:accept');
  });

  it('resolves higher-priority context first', () => {
    const resolver = new KeybindingResolver();
    // In Chat context, enter = submit
    // In Select context, enter = accept
    resolver.pushContext('Select');
    const enterEvent = { key: 'enter', ctrl: false, shift: false, meta: false };
    expect(resolver.resolve(enterEvent)).toBe('select:accept');
  });

  it('falls back to global when no context matches', () => {
    const resolver = new KeybindingResolver();
    const event = { key: 'z', ctrl: true, shift: false, meta: false };
    expect(resolver.resolve(event)).toBeUndefined();
  });

  it('popContext removes context', () => {
    const resolver = new KeybindingResolver();
    resolver.pushContext('Select');
    resolver.popContext('Select');
    // After popping Select, enter falls back to the default priority order.
    // In default priority, Confirmation > Chat, so "y/Enter" = confirm:yes.
    // This is expected behavior — the resolver uses the full priority order
    // when no specific contexts are pushed.
    const enterEvent = { key: 'enter', ctrl: false, shift: false, meta: false };
    // When Chat context is pushed, enter resolves to chat:submit
    resolver.pushContext('Chat');
    expect(resolver.resolve(enterEvent)).toBe('chat:submit');
  });

  it('user overrides take precedence', () => {
    const resolver = new KeybindingResolver(undefined, [
      { context: 'Chat', key: 'ctrl+g', action: 'chat:externalEditor' },
    ]);
    resolver.pushContext('Chat');
    const event = { key: 'g', ctrl: true, shift: false, meta: false };
    expect(resolver.resolve(event)).toBe('chat:externalEditor');
  });
});

// ── Reserved shortcuts ─────────────────────────────────

describe('isReserved', () => {
  it('ctrl+c is reserved', () => {
    expect(isReserved('ctrl+c')).toBe(true);
  });

  it('ctrl+d is reserved', () => {
    expect(isReserved('ctrl+d')).toBe(true);
  });

  it('ctrl+l is not reserved', () => {
    expect(isReserved('ctrl+l')).toBe(false);
  });
});

// ── Validation ─────────────────────────────────────────

describe('validateUserBindings', () => {
  it('accepts valid bindings', () => {
    const result = validateUserBindings([
      { context: 'Chat', key: 'ctrl+g', action: 'chat:externalEditor' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  it('rejects reserved shortcuts', () => {
    const result = validateUserBindings([
      { context: 'Global', key: 'ctrl+c', action: 'chat:submit' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].severity).toBe('error');
  });

  it('warns on unknown context', () => {
    const result = validateUserBindings([
      { context: 'Foo' as any, key: 'ctrl+g', action: 'chat:externalEditor' },
    ]);
    expect(result.issues[0].severity).toBe('warning');
  });

  it('warns on unknown action', () => {
    const result = validateUserBindings([
      { context: 'Chat', key: 'ctrl+g', action: 'nonexistent:action' },
    ]);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('errors on invalid key combo', () => {
    const result = validateUserBindings([
      { context: 'Chat', key: 'ctrl+', action: 'chat:externalEditor' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].severity).toBe('error');
  });
});

// ── Default bindings ───────────────────────────────────

describe('getDefaultKeybindings', () => {
  it('returns all 20 contexts', () => {
    const blocks = getDefaultKeybindings();
    expect(blocks.length).toBe(20);
  });

  it('Global context has interrupt binding', () => {
    const blocks = getDefaultKeybindings();
    const global = blocks.find((b) => b.context === 'Global');
    expect(global?.bindings['ctrl+c']).toBe('app:interrupt');
  });

  it('Chat context has submit binding', () => {
    const blocks = getDefaultKeybindings();
    const chat = blocks.find((b) => b.context === 'Chat');
    expect(chat?.bindings['enter']).toBe('chat:submit');
  });
});

describe('getAllActions', () => {
  it('returns all unique action identifiers', () => {
    const actions = getAllActions();
    expect(actions.length).toBeGreaterThan(30);
    expect(actions).toContain('app:interrupt');
    expect(actions).toContain('chat:submit');
  });
});
