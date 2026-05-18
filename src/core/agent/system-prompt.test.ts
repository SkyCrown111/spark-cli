import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAgentSystemPrompt,
  getCachedProjectContext,
  refreshProjectContext,
  _resetSystemPromptForTests,
} from './system-prompt.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-sysp-'));
  _resetSystemPromptForTests();
});

describe('buildAgentSystemPrompt', () => {
  it('renders identity, project context, and tool preamble for staging mode', () => {
    const out = buildAgentSystemPrompt({
      projectRoot,
      writeMode: 'staging',
      mode: 'normal',
    });
    expect(out).toMatch(/SparkCLI/);
    expect(out).toMatch(/Tool use/i);
    expect(out).toMatch(/STAGING/);
    expect(out).not.toMatch(/PLAN MODE ENGAGED/);
  });

  it('switches preamble for direct write mode', () => {
    const out = buildAgentSystemPrompt({
      projectRoot,
      writeMode: 'direct',
      mode: 'normal',
    });
    expect(out).toMatch(/DIRECT/);
    expect(out).not.toMatch(/STAGING \(default\)/);
  });

  it('engages plan-mode rules in plan mode', () => {
    const out = buildAgentSystemPrompt({
      projectRoot,
      writeMode: 'staging',
      mode: 'plan',
    });
    expect(out).toMatch(/PLAN MODE ENGAGED/);
    expect(out).toMatch(/read_file, list_dir, glob, grep/);
  });

  it('caches project context across calls and refresh recomputes', () => {
    const a = getCachedProjectContext(projectRoot);
    const b = getCachedProjectContext(projectRoot);
    expect(b).toBe(a);
    const c = refreshProjectContext(projectRoot);
    expect(c).not.toBe(a);
  });
});
