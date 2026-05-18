import { describe, it, expect } from 'vitest';
import { buildAnimTemplate, parseStateChain } from './template.js';
import { validateAnimGraph } from './types.js';

describe('parseStateChain', () => {
  it('parses arrow chains', () => {
    expect(parseStateChain('Idle→Run→Jump')).toEqual(['Idle', 'Run', 'Jump']);
    expect(parseStateChain('Idle->Run')).toEqual(['Idle', 'Run']);
  });
});

describe('buildAnimTemplate', () => {
  it('builds states and transitions', () => {
    const g = buildAnimTemplate('Player', 'Idle→Run→Jump，地面检测');
    expect(validateAnimGraph(g)).toBe(true);
    expect(g.states.map((s) => s.id)).toEqual(['Idle', 'Run', 'Jump']);
    expect(g.parameters.some((p) => p.name === 'IsGrounded')).toBe(true);
  });
});
