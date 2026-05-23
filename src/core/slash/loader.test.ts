import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontmatter, loadFileCommands } from '../../core/slash/loader.js';
import { createSlashRegistry } from '../../core/slash/registry.js';
import { buildBuiltinCommands } from '../../core/slash/built-ins.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-slash-loader-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('parseFrontmatter', () => {
  it('returns empty frontmatter for plain markdown', () => {
    const { frontmatter, body } = parseFrontmatter('hello world');
    expect(frontmatter).toEqual({});
    expect(body).toBe('hello world');
  });

  it('parses description, arguments, mode, allowedTools', () => {
    const raw = [
      '---',
      'description: Quick scan',
      'arguments: <path>',
      'mode: plan',
      'allowedTools: [read_file, grep]',
      '---',
      'Body line 1',
      'Body line 2',
    ].join('\n');
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.description).toBe('Quick scan');
    expect(frontmatter.arguments).toBe('<path>');
    expect(frontmatter.mode).toBe('plan');
    expect(frontmatter.allowedTools).toEqual(['read_file', 'grep']);
    expect(body).toBe('Body line 1\nBody line 2');
  });

  it('accepts comma-list allowedTools without brackets', () => {
    const raw = ['---', 'allowedTools: read_file, grep', '---', 'body'].join('\n');
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.allowedTools).toEqual(['read_file', 'grep']);
  });

  it('ignores invalid mode values', () => {
    const raw = ['---', 'mode: weird', '---', 'body'].join('\n');
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.mode).toBeUndefined();
  });

  it('treats unterminated frontmatter as plain body', () => {
    const raw = ['---', 'description: oops', 'body without close'].join('\n');
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(body).toContain('description: oops');
  });
});

describe('loadFileCommands', () => {
  it('loads project markdown commands and exposes a synthetic prompt', async () => {
    const dir = join(projectRoot, '.spark', 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'scan.md'),
      ['---', 'description: Scan files', 'mode: plan', '---', 'Scan the repo for $ARGUMENTS'].join(
        '\n',
      ),
      'utf8',
    );

    const reg = createSlashRegistry();
    loadFileCommands(reg, projectRoot);

    const cmd = reg.get('scan');
    expect(cmd?.source).toBe('project');
    expect(cmd?.description).toBe('Scan files');
    expect(cmd?.mode).toBe('plan');

    const outcome = await reg.dispatch('/scan TODO', { project: projectRoot });
    expect(outcome.kind).toBe('prompt');
    if (outcome.kind === 'prompt') {
      expect(outcome.text).toBe('Scan the repo for TODO');
      expect(outcome.mode).toBe('plan');
    }
  });

  it('skips files with non-conforming names', () => {
    const dir = join(projectRoot, '.spark', 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Bad Name.md'), 'body', 'utf8');

    const reg = createSlashRegistry();
    loadFileCommands(reg, projectRoot);
    expect(reg.list()).toEqual([]);
  });

  it('does not override built-in commands', () => {
    const dir = join(projectRoot, '.spark', 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'help.md'), 'project help override', 'utf8');

    const reg = createSlashRegistry();
    for (const c of buildBuiltinCommands()) reg.register(c);
    loadFileCommands(reg, projectRoot);

    const cmd = reg.get('help');
    expect(cmd?.source).toBe('builtin');
  });

  it('returns unknown for missing commands', async () => {
    const reg = createSlashRegistry();
    loadFileCommands(reg, projectRoot);
    const r = await reg.dispatch('/missing', { project: projectRoot });
    expect(r.kind).toBe('unknown');
  });

  it('falls back to legacy .spark-cli/commands', async () => {
    const dir = join(projectRoot, '.spark-cli', 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'legacy.md'), 'legacy body', 'utf8');

    const reg = createSlashRegistry();
    loadFileCommands(reg, projectRoot);

    const cmd = reg.get('legacy');
    expect(cmd?.source).toBe('project');
  });
});
