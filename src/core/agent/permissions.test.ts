import { describe, it, expect } from 'vitest';
import { isToolAllowed, isProtectedPath } from './permissions.js';
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

describe('permissions acceptEdits mode', () => {
  it('auto-approves read-only tools', () => {
    const r = isToolAllowed({
      toolName: 'read_file',
      mutates: false,
      planModeAllowed: true,
      mode: 'normal',
      writeMode: 'staging',
      config: DEFAULT_CONFIG,
      permissionMode: 'acceptEdits',
    });
    expect(r.allowed).toBe(true);
    expect(r.askOverride).toBeUndefined();
  });

  it('auto-approves write_file targeting a normal path', () => {
    const r = isToolAllowed({
      toolName: 'write_file',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: DEFAULT_CONFIG,
      permissionMode: 'acceptEdits',
      toolArgs: { path: 'src/foo.ts' },
    });
    expect(r.allowed).toBe(true);
    expect(r.askOverride).toBeUndefined();
  });

  it('forces confirm for write_file targeting a protected path', () => {
    const r = isToolAllowed({
      toolName: 'write_file',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: DEFAULT_CONFIG,
      permissionMode: 'acceptEdits',
      toolArgs: { path: '.git/config' },
    });
    expect(r.allowed).toBe(true);
    expect(r.askOverride).toBe(true);
  });
});

describe('permissions dontAsk mode', () => {
  it('auto-denies tools not in the allowed set', () => {
    const r = isToolAllowed({
      toolName: 'bash',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: DEFAULT_CONFIG,
      permissionMode: 'dontAsk',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/dontAsk/i);
  });

  it('allows tools via config rule', () => {
    const r = isToolAllowed({
      toolName: 'bash',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: {
        ...DEFAULT_CONFIG,
        security: {
          toolRules: [{ specifier: 'Tool(bash)', action: 'allow' }],
        },
      },
      permissionMode: 'dontAsk',
    });
    expect(r.allowed).toBe(true);
  });
});

describe('permissions config rules', () => {
  it('denies tool matching a deny rule', () => {
    const r = isToolAllowed({
      toolName: 'bash',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: {
        ...DEFAULT_CONFIG,
        security: {
          toolRules: [{ specifier: 'Tool(bash)', action: 'deny' }],
        },
      },
      permissionMode: 'default',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/config rule/i);
  });

  it('allows tool matching an allow rule', () => {
    const r = isToolAllowed({
      toolName: 'bash',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: {
        ...DEFAULT_CONFIG,
        security: {
          toolRules: [{ specifier: 'Tool(bash)', action: 'allow' }],
        },
      },
      permissionMode: 'default',
    });
    expect(r.allowed).toBe(true);
    expect(r.askOverride).toBeUndefined();
  });

  it('forces confirm for ask rule', () => {
    const r = isToolAllowed({
      toolName: 'bash',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: {
        ...DEFAULT_CONFIG,
        security: {
          toolRules: [{ specifier: 'Tool(bash)', action: 'ask' }],
        },
      },
      permissionMode: 'default',
    });
    expect(r.allowed).toBe(true);
    expect(r.askOverride).toBe(true);
  });

  it('deny rule takes precedence over allow when matched first', () => {
    const r = isToolAllowed({
      toolName: 'write_file',
      mutates: true,
      planModeAllowed: false,
      mode: 'normal',
      writeMode: 'staging',
      config: {
        ...DEFAULT_CONFIG,
        security: {
          toolRules: [
            { specifier: 'Tool(write_file:.git/**)', action: 'deny' },
            { specifier: 'Tool(write_file)', action: 'allow' },
          ],
        },
      },
      permissionMode: 'default',
      toolArgs: { path: '.git/config' },
    });
    expect(r.allowed).toBe(false);
  });
});

describe('protected paths', () => {
  it('detects .git as protected', () => {
    expect(isProtectedPath('.git/config')).toBe(true);
    expect(isProtectedPath('.git')).toBe(true);
  });

  it('does not flag normal src paths', () => {
    expect(isProtectedPath('src/foo.ts')).toBe(false);
    expect(isProtectedPath('package.json')).toBe(false);
  });

  it('supports custom protected paths', () => {
    expect(isProtectedPath('secrets/keys.pem', ['secrets'])).toBe(true);
    expect(isProtectedPath('src/app.ts', ['secrets'])).toBe(false);
  });
});
