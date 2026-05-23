import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { loadAgentDefinition, loadAllAgentDefinitions, findAgentDefinition } from './agent-defs.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-agentdefs-'));
  mkdirSync(join(projectRoot, '.spark', 'agents'), { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('loadAgentDefinition', () => {
  it('returns null for non-existent file', () => {
    expect(loadAgentDefinition(join(projectRoot, 'nope.md'))).toBeNull();
  });

  it('parses frontmatter with name, model, tools, bg', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'reviewer.md');
    writeFileSync(
      filePath,
      `---
name: code-reviewer
model: openai/gpt-4o
tools: [read_file, glob, grep]
bg: true
---
You are a code reviewer. Analyze the project for issues.`,
      'utf8',
    );

    const def = loadAgentDefinition(filePath)!;
    expect(def).not.toBeNull();
    expect(def.name).toBe('code-reviewer');
    expect(def.model).toBe('openai/gpt-4o');
    expect(def.tools).toEqual(['read_file', 'glob', 'grep']);
    expect(def.bg).toBe(true);
    expect(def.prompt).toBe('You are a code reviewer. Analyze the project for issues.');
    expect(def.sourcePath).toBe(filePath);
  });

  it('uses filename as name when frontmatter has no name', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'helper.md');
    writeFileSync(filePath, `---\nmodel: anthropic/claude-sonnet-4-20250514\n---\nHello.`, 'utf8');

    const def = loadAgentDefinition(filePath)!;
    expect(def.name).toBe('helper');
    expect(def.model).toBe('anthropic/claude-sonnet-4-20250514');
    expect(def.bg).toBe(false);
  });

  it('defaults bg to false when not specified', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'simple.md');
    writeFileSync(filePath, `---\nname: simple\n---\nJust a prompt.`, 'utf8');

    const def = loadAgentDefinition(filePath)!;
    expect(def.bg).toBe(false);
  });

  it('handles boolean bg: false', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'nobg.md');
    writeFileSync(filePath, `---\nname: nobg\nbg: false\n---\nPrompt.`, 'utf8');

    const def = loadAgentDefinition(filePath)!;
    expect(def.bg).toBe(false);
  });

  it('uses default prompt when body is empty', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'empty.md');
    writeFileSync(filePath, `---\nname: empty\n---\n`, 'utf8');

    const def = loadAgentDefinition(filePath)!;
    expect(def.prompt).toBe('You are the empty agent.');
  });

  it('parses file with no frontmatter at all', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'nofm.md');
    writeFileSync(filePath, 'Just plain text, no frontmatter.', 'utf8');

    const def = loadAgentDefinition(filePath)!;
    expect(def.name).toBe('nofm');
    expect(def.bg).toBe(false);
    expect(def.prompt).toBe('Just plain text, no frontmatter.');
  });

  it('handles tools as a quoted array', () => {
    const filePath = join(projectRoot, '.spark', 'agents', 'quoted.md');
    writeFileSync(filePath, `---\nname: quoted\ntools: ["read_file", "glob"]\n---\nHi.`, 'utf8');

    const def = loadAgentDefinition(filePath)!;
    expect(def.tools).toEqual(['read_file', 'glob']);
  });
});

describe('loadAllAgentDefinitions', () => {
  it('returns empty array when agents dir has no .md files', () => {
    expect(loadAllAgentDefinitions(projectRoot)).toEqual([]);
  });

  it('returns empty array when agents dir does not exist', () => {
    rmSync(join(projectRoot, '.spark', 'agents'), { recursive: true, force: true });
    expect(loadAllAgentDefinitions(projectRoot)).toEqual([]);
  });

  it('loads multiple agent definitions', () => {
    writeFileSync(
      join(projectRoot, '.spark', 'agents', 'a.md'),
      `---\nname: agent-a\n---\nPrompt A.`,
      'utf8',
    );
    writeFileSync(
      join(projectRoot, '.spark', 'agents', 'b.md'),
      `---\nname: agent-b\nbg: true\n---\nPrompt B.`,
      'utf8',
    );
    // Non-.md file should be ignored
    writeFileSync(join(projectRoot, '.spark', 'agents', 'notes.txt'), 'Not an agent.', 'utf8');

    const defs = loadAllAgentDefinitions(projectRoot);
    expect(defs).toHaveLength(2);
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['agent-a', 'agent-b']);
  });
});

describe('findAgentDefinition', () => {
  it('finds agent by filename match', () => {
    writeFileSync(
      join(projectRoot, '.spark', 'agents', 'reviewer.md'),
      `---\nname: different-name\n---\nHi.`,
      'utf8',
    );

    const def = findAgentDefinition(projectRoot, 'reviewer');
    expect(def).not.toBeNull();
    expect(def!.name).toBe('different-name');
  });

  it('finds agent by frontmatter name', () => {
    writeFileSync(
      join(projectRoot, '.spark', 'agents', 'xyz.md'),
      `---\nname: code-reviewer\n---\nHi.`,
      'utf8',
    );

    const def = findAgentDefinition(projectRoot, 'code-reviewer');
    expect(def).not.toBeNull();
    expect(def!.name).toBe('code-reviewer');
  });

  it('returns null when agent not found', () => {
    expect(findAgentDefinition(projectRoot, 'nonexistent')).toBeNull();
  });

  it('prefers filename match over frontmatter name match', () => {
    // File "foo.md" with frontmatter name "bar"
    writeFileSync(
      join(projectRoot, '.spark', 'agents', 'foo.md'),
      `---\nname: bar\n---\nHi.`,
      'utf8',
    );

    // Searching by filename "foo" should find it directly
    const def = findAgentDefinition(projectRoot, 'foo');
    expect(def).not.toBeNull();
    expect(def!.sourcePath).toContain('foo.md');
  });
});
