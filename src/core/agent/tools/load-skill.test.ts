import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkillTool } from './load-skill.js';
import { createSkillRegistry } from '../../skills/registry.js';
import type { ToolContext } from '../tool-registry.js';
import type { SparkCLIConfig } from '../../../config/schema.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-load-skill-'));
});

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot,
    config: {} as SparkCLIConfig,
    writeMode: 'staging',
    mode: 'normal',
    agentId: 'a1',
    depth: 0,
    skillAllowedTools: new Set<string>(),
    ...overrides,
  };
}

describe('load_skill tool', () => {
  it('returns the skill body and widens the allow-list', async () => {
    const skills = createSkillRegistry();
    skills.register({
      name: 'tilemap',
      description: 'tilemap helpers',
      body: 'use TiledMap.setTilesByCoord',
      triggers: ['tilemap'],
      allowedTools: ['write_file'],
    });

    const allowed = new Set<string>();
    const r = await loadSkillTool.handler(
      { name: 'tilemap' },
      ctx({ skills, skillAllowedTools: allowed }),
    );
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('Loaded skill: tilemap');
    expect(r.content).toContain('TiledMap.setTilesByCoord');
    expect(allowed.has('write_file')).toBe(true);
  });

  it('errors when skill name missing or registry absent', async () => {
    const noReg = await loadSkillTool.handler({ name: 'x' }, ctx());
    expect(noReg.isError).toBe(true);
    expect(noReg.content).toMatch(/no skill registry/);

    const skills = createSkillRegistry();
    const notFound = await loadSkillTool.handler(
      { name: 'missing' },
      ctx({ skills }),
    );
    expect(notFound.isError).toBe(true);
    expect(notFound.content).toMatch(/not found/);
  });

  it('rejects empty name', async () => {
    const skills = createSkillRegistry();
    const r = await loadSkillTool.handler({ name: '' }, ctx({ skills }));
    expect(r.isError).toBe(true);
  });
});
