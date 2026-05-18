import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { listEngineMcpTools } from './engine-tools.js';

describe('engine-tools', () => {
  it('lists Cocos engine MCP tools', () => {
    const tools = listEngineMcpTools(join(process.cwd(), 'fixtures/cocos-3.8-mini'), {});
    expect(tools.some((t) => t.name === 'cocos_build_scene')).toBe(true);
    expect(tools.every((t) => t.engine === 'cocos-creator')).toBe(true);
  });
});
