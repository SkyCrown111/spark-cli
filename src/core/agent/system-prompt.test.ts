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
import { createSkillRegistry } from '../skills/registry.js';

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
    expect(out).toMatch(/read_file, list_dir, glob, grep, load_skill/);
  });

  it('includes a skills index when a registry is provided', () => {
    const skills = createSkillRegistry();
    skills.register({
      name: 'demo-skill',
      description: 'Demo',
      body: 'body',
      triggers: ['alpha'],
    });
    const out = buildAgentSystemPrompt({
      projectRoot,
      writeMode: 'staging',
      mode: 'normal',
      skills,
    });
    expect(out).toMatch(/Skills \(index\)/);
    expect(out).toMatch(/demo-skill/);
    expect(out).toMatch(/load_skill/);
  });

  it('caches project context across calls and refresh recomputes', () => {
    const a = getCachedProjectContext(projectRoot);
    const b = getCachedProjectContext(projectRoot);
    expect(b).toBe(a);
    const c = refreshProjectContext(projectRoot);
    expect(c).not.toBe(a);
  });
});
