import { describe, it, expect } from 'vitest';
import { isToolAllowed } from './permissions.js';
import { DEFAULT_CONFIG } from '../../config/schema.js';

describe('permissions MCP writes', () => {
  it('blocks scene_remove_node in plan mode', () => {
    const r = isToolAllowed({
      toolName: 'scene_remove_node',
      mutates: true,
      planModeAllowed: false,
      mode: 'plan',
      writeMode: 'staging',
      config: DEFAULT_CONFIG,
    });
    expect(r.allowed).toBe(false);
  });

  it('requires mcp.allowWrite for MCP write tools in normal mode', () => {
    const r = isToolAllowed({
      toolName: 'scene_remove_node',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: { ...DEFAULT_CONFIG, mcp: { allowWrite: false, port: 17321 } },
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/mcp\.allowWrite/i);
  });
});
