import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHooks } from './runner.js';
import { loadHookConfig } from './config.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-hooks-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function writeHookConfig(content: unknown): void {
  const dir = join(projectRoot, '.spark-cli', 'hooks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(content), 'utf8');
}

function writeNodeHook(name: string, body: string): string {
  const path = join(projectRoot, name);
  writeFileSync(path, body, 'utf8');
  // Make executable on POSIX; harmless on Windows.
  try {
    chmodSync(path, 0o755);
  } catch {
    /* noop */
  }
  return path;
}

describe('loadHookConfig', () => {
  it('returns empty list when config missing', () => {
    const cfg = loadHookConfig(projectRoot);
    expect(cfg.hooks).toEqual([]);
  });

  it('parses valid entries and drops malformed ones', () => {
    writeHookConfig({
      hooks: [
        { event: 'pre_tool', command: 'echo hi' },
        { event: 'unknown', command: 'echo bad' },
        { event: 'post_tool', command: 'echo done', tools: ['bash'] },
        { event: 'pre_tool' /* missing command/script */ },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    expect(cfg.hooks).toHaveLength(2);
    expect(cfg.hooks[0]?.event).toBe('pre_tool');
    expect(cfg.hooks[1]?.tools).toEqual(['bash']);
  });
});

describe('runHooks', () => {
  it('passes JSON payload via stdin', () => {
    const hookPath = writeNodeHook(
      'echo-payload.js',
      `let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  process.stderr.write('event=' + j.event);
  process.exit(0);
});`,
    );
    writeHookConfig({
      hooks: [
        {
          event: 'post_tool',
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    const result = runHooks(
      'post_tool',
      {
        event: 'post_tool',
        projectRoot,
        tool: 'bash',
        args: '{}',
        agentId: 'a1',
        durationMs: 12,
        isError: false,
      },
      projectRoot,
      { config: cfg, tool: 'bash' },
    );
    expect(result.blocked).toBe(false);
    expect(result.results[0]?.stderr).toContain('event=post_tool');
  });

  it('blocks pre_tool when hook exits non-zero', () => {
    const hookPath = writeNodeHook(
      'block.js',
      `process.stderr.write('denied: bash forbidden');
process.exit(1);`,
    );
    writeHookConfig({
      hooks: [
        {
          event: 'pre_tool',
          tools: ['bash'],
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    const result = runHooks(
      'pre_tool',
      {
        event: 'pre_tool',
        projectRoot,
        tool: 'bash',
        args: '{}',
        agentId: 'a1',
        writeMode: 'staging',
      },
      projectRoot,
      { config: cfg, tool: 'bash' },
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('denied');
  });

  it('skips tool-restricted hooks for non-matching tool', () => {
    const hookPath = writeNodeHook(
      'always-block.js',
      `process.stderr.write('blocked');
process.exit(1);`,
    );
    writeHookConfig({
      hooks: [
        {
          event: 'pre_tool',
          tools: ['bash'],
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    const result = runHooks(
      'pre_tool',
      {
        event: 'pre_tool',
        projectRoot,
        tool: 'read_file',
        args: '{}',
        agentId: 'a1',
        writeMode: 'staging',
      },
      projectRoot,
      { config: cfg, tool: 'read_file' },
    );
    expect(result.blocked).toBe(false);
    expect(result.results).toHaveLength(0);
  });

  it('non-blocking event ignores non-zero exits', () => {
    const hookPath = writeNodeHook(
      'noisy.js',
      `process.stderr.write('warn');
process.exit(2);`,
    );
    writeHookConfig({
      hooks: [
        {
          event: 'session_start',
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    const result = runHooks(
      'session_start',
      {
        event: 'session_start',
        projectRoot,
        writeMode: 'staging',
        startedAt: new Date().toISOString(),
      },
      projectRoot,
      { config: cfg },
    );
    expect(result.blocked).toBe(false);
    expect(result.results[0]?.status).toBe(2);
  });

  it('delivers on_skill_load payload to user script', () => {
    const hookPath = writeNodeHook(
      'skill-tap.js',
      `let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  process.stderr.write('skill=' + j.name + ' tools=' + j.allowedTools.join('|'));
  process.exit(0);
});`,
    );
    writeHookConfig({
      hooks: [
        {
          event: 'on_skill_load',
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    const result = runHooks(
      'on_skill_load',
      {
        event: 'on_skill_load',
        projectRoot,
        agentId: 'a1',
        name: 'cocos-tilemap',
        allowedTools: ['read_file', 'write_file'],
      },
      projectRoot,
      { config: cfg },
    );
    expect(result.blocked).toBe(false);
    expect(result.results[0]?.stderr).toContain('skill=cocos-tilemap');
    expect(result.results[0]?.stderr).toContain('tools=read_file|write_file');
  });

  it('delivers on_plan_exit with approved flag', () => {
    const hookPath = writeNodeHook(
      'plan-tap.js',
      `let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  process.stderr.write('approved=' + j.approved);
  process.exit(0);
});`,
    );
    writeHookConfig({
      hooks: [
        {
          event: 'on_plan_exit',
          script: { interpreter: process.execPath, path: hookPath },
        },
      ],
    });
    const cfg = loadHookConfig(projectRoot);
    const result = runHooks(
      'on_plan_exit',
      { event: 'on_plan_exit', projectRoot, approved: true },
      projectRoot,
      { config: cfg },
    );
    expect(result.results[0]?.stderr).toContain('approved=true');
  });
});
