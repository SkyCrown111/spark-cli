import { describe, it, expect } from 'vitest';
import { serializeSession, deserializeSession, type SessionSnapshot } from './serializer.js';

function makeSnapshot(overrides?: Partial<SessionSnapshot>): SessionSnapshot {
  return {
    id: 'test-session-1',
    projectRoot: '/work/project',
    history: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    writeMode: 'staging',
    permissionMode: 'default',
    effortLevel: 'medium',
    alwaysAllowSet: ['bash'],
    plan: { phase: 'normal' },
    model: 'openai/gpt-4o',
    title: 'Test session',
    startedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('serializeSession / deserializeSession', () => {
  it('round-trips a basic snapshot', () => {
    const snapshot = makeSnapshot();
    const raw = serializeSession(snapshot);
    const restored = deserializeSession(raw);
    expect(restored.id).toBe(snapshot.id);
    expect(restored.history).toEqual(snapshot.history);
    expect(restored.writeMode).toBe(snapshot.writeMode);
    expect(restored.alwaysAllowSet).toEqual(snapshot.alwaysAllowSet);
    expect(restored.title).toBe(snapshot.title);
  });

  it('preserves tool_calls in assistant messages', () => {
    const snapshot = makeSnapshot({
      history: [
        { role: 'user', content: 'Read foo.ts' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"foo.ts"}' },
            },
          ],
        },
        { role: 'tool', content: 'file contents here', tool_call_id: 'call_1' },
      ],
    });
    const raw = serializeSession(snapshot);
    const restored = deserializeSession(raw);
    const assistant = restored.history[1];
    expect(assistant.role).toBe('assistant');
    if ('tool_calls' in assistant) {
      expect(assistant.tool_calls?.length).toBe(1);
      expect(assistant.tool_calls?.[0].function.name).toBe('read_file');
    }
    const tool = restored.history[2];
    expect(tool.role).toBe('tool');
    if ('tool_call_id' in tool) {
      expect(tool.tool_call_id).toBe('call_1');
    }
  });

  it('fills in defaults for missing fields', () => {
    const raw = JSON.stringify({
      id: 'minimal',
      projectRoot: '/work/x',
      history: [],
    });
    const restored = deserializeSession(raw);
    expect(restored.writeMode).toBe('staging');
    expect(restored.permissionMode).toBe('default');
    expect(restored.effortLevel).toBe('medium');
    expect(restored.alwaysAllowSet).toEqual([]);
    expect(restored.plan).toEqual({ phase: 'normal' });
  });

  it('throws on invalid data', () => {
    expect(() => deserializeSession('{}')).toThrow(/missing required fields/);
  });
});
