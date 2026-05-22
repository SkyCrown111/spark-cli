import { describe, it, expect } from 'vitest';
import { createAgentRegistry, type AgentDefinition } from './registry.js';

describe('AgentRegistry', () => {
  it('registers and retrieves agents', () => {
    const reg = createAgentRegistry();
    const agent: AgentDefinition = {
      name: 'code-reviewer',
      description: 'Reviews code',
      systemPrompt: 'You are a code reviewer.',
    };
    reg.register(agent);
    expect(reg.get('code-reviewer')).toEqual(agent);
  });

  it('case-insensitive lookup', () => {
    const reg = createAgentRegistry();
    reg.register({ name: 'MyAgent', systemPrompt: 'test' });
    expect(reg.has('myagent')).toBe(true);
    expect(reg.has('MYAGENT')).toBe(true);
    expect(reg.has('MyAgent')).toBe(true);
  });

  it('lists agents sorted by name', () => {
    const reg = createAgentRegistry();
    reg.register({ name: 'zebra', systemPrompt: 'z' });
    reg.register({ name: 'alpha', systemPrompt: 'a' });
    reg.register({ name: 'middle', systemPrompt: 'm' });
    const list = reg.list();
    expect(list.map((a) => a.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('later registration overwrites same name', () => {
    const reg = createAgentRegistry();
    reg.register({ name: 'agent', systemPrompt: 'v1' });
    reg.register({ name: 'agent', systemPrompt: 'v2' });
    expect(reg.get('agent')?.systemPrompt).toBe('v2');
  });

  it('returns undefined for unknown agent', () => {
    const reg = createAgentRegistry();
    expect(reg.get('nonexistent')).toBeUndefined();
    expect(reg.has('nonexistent')).toBe(false);
  });
});
