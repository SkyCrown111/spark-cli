import { describe, it, expect } from 'vitest';
import {
  isSensitiveTool,
  summarizeToolArgs,
  ToolPermissionSession,
} from './tool-permissions.js';

describe('tool-permissions', () => {
  it('marks bash, file writes, and MCP scene writes sensitive', () => {
    expect(isSensitiveTool('bash')).toBe(true);
    expect(isSensitiveTool('write_file')).toBe(true);
    expect(isSensitiveTool('scene_remove_node')).toBe(true);
    expect(isSensitiveTool('unity_scene_set_property')).toBe(true);
    expect(isSensitiveTool('read_file')).toBe(false);
  });

  it('summarizes bash command', () => {
    expect(summarizeToolArgs('bash', { command: 'pnpm test' })).toBe('pnpm test');
  });

  it('session allow-always skips re-prompt', () => {
    const s = new ToolPermissionSession();
    s.allowAlways('bash');
    expect(s.isAlwaysAllowed('bash')).toBe(true);
    expect(s.isAlwaysAllowed('write_file')).toBe(false);
  });
});
