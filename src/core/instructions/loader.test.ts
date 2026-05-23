import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectInstructions } from './loader.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-instructions-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('loadProjectInstructions', () => {
  it('loads SPARK.md and .spark/rules as the primary protocol', () => {
    writeFileSync(join(projectRoot, 'SPARK.md'), 'Project rules', 'utf8');
    mkdirSync(join(projectRoot, '.spark', 'rules'), { recursive: true });
    writeFileSync(join(projectRoot, '.spark', 'rules', 'global.md'), 'Always do X', 'utf8');

    const result = loadProjectInstructions(projectRoot);
    expect(result.projectInstructions).toBe('Project rules');
    expect(result.combined).toContain('Project rules');
    expect(result.combined).toContain('Always do X');
  });

  it('prefers SPARK.md and .spark/rules over legacy files when both exist', () => {
    writeFileSync(join(projectRoot, 'SPARK.md'), 'New project rules', 'utf8');
    writeFileSync(join(projectRoot, 'SPARKCLI.md'), 'Legacy project rules', 'utf8');
    mkdirSync(join(projectRoot, '.spark', 'rules'), { recursive: true });
    mkdirSync(join(projectRoot, '.spark-cli', 'rules'), { recursive: true });
    writeFileSync(join(projectRoot, '.spark', 'rules', 'global.md'), 'New rule', 'utf8');
    writeFileSync(join(projectRoot, '.spark-cli', 'rules', 'global.md'), 'Legacy rule', 'utf8');

    const result = loadProjectInstructions(projectRoot);
    expect(result.projectInstructions).toBe('New project rules');
    expect(result.combined).toContain('New rule');
    expect(result.combined).not.toContain('Legacy rule');
  });

  it('falls back to legacy SPARKCLI.md and .spark-cli/rules', () => {
    writeFileSync(join(projectRoot, 'SPARKCLI.md'), 'Legacy project rules', 'utf8');
    mkdirSync(join(projectRoot, '.spark-cli', 'rules'), { recursive: true });
    writeFileSync(join(projectRoot, '.spark-cli', 'rules', 'global.md'), 'Legacy rule', 'utf8');

    const result = loadProjectInstructions(projectRoot);
    expect(result.projectInstructions).toBe('Legacy project rules');
    expect(result.combined).toContain('Legacy rule');
  });
});
