import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkillFile, loadSkillsFromDisk, loadSkillsFromParentDir, compileSkillTriggerPattern } from './loader.js';
import { createSkillRegistry } from './registry.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-skills-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('parseSkillFile', () => {
  it('parses frontmatter and body', () => {
    const raw = [
      '---',
      'name: tilemap',
      'description: Tilemap helpers',
      'triggers: [tilemap, tile map]',
      'allowedTools: [read_file]',
      '---',
      'Body here',
    ].join('\n');
    const parsed = parseSkillFile(raw);
    expect(parsed.frontmatter.name).toBe('tilemap');
    expect(parsed.frontmatter.triggers).toEqual(['tilemap', 'tile map']);
    expect(parsed.frontmatter.allowedTools).toEqual(['read_file']);
    expect(parsed.body).toBe('Body here');
  });

  it('keeps body when frontmatter is missing', () => {
    const parsed = parseSkillFile('Just text.');
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe('Just text.');
  });
});

describe('compileSkillTriggerPattern', () => {
  it('parses slash-delimited regex', () => {
    const r = compileSkillTriggerPattern('/foo.bar/i');
    expect(r?.test('FooXbar')).toBe(true);
  });
  it('returns undefined for invalid pattern', () => {
    expect(compileSkillTriggerPattern('[')).toBeUndefined();
  });
});

describe('loadSkillsFromParentDir', () => {
  function projectSkillsDir(): string {
    return join(projectRoot, '.spark-cli', 'skills');
  }

  function writeSkill(name: string, raw: string): void {
    const dir = join(projectSkillsDir(), name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), raw, 'utf8');
  }

  it('loads multiple skills with triggers', () => {
    writeSkill(
      'tilemap',
      ['---', 'description: tilemap helpers', 'triggers: [tilemap, TiledMap]', '---', 'body-tile'].join('\n'),
    );
    writeSkill(
      'physics',
      ['---', 'description: physics tips', 'triggers: [physics, rigidbody]', '---', 'body-phys'].join('\n'),
    );

    const reg = createSkillRegistry();
    loadSkillsFromParentDir(reg, projectSkillsDir());

    expect(reg.list().map((s) => s.name).sort()).toEqual(['physics', 'tilemap']);
    expect(reg.get('tilemap')?.body).toBe('body-tile');
  });

  it('uses folder name when frontmatter omits name', () => {
    writeSkill('cocos-tilemap', '---\ndescription: x\n---\nbody');
    const reg = createSkillRegistry();
    loadSkillsFromParentDir(reg, projectSkillsDir());
    expect(reg.get('cocos-tilemap')).toBeTruthy();
  });

  it('skips entries without SKILL.md', () => {
    mkdirSync(join(projectSkillsDir(), 'empty'), { recursive: true });
    const reg = createSkillRegistry();
    loadSkillsFromParentDir(reg, projectSkillsDir());
    expect(reg.list()).toEqual([]);
  });

  it('later directory load overwrites same skill name', () => {
    const a = join(projectRoot, 'a-skills');
    const b = join(projectRoot, 'b-skills');
    mkdirSync(join(a, 'dup'), { recursive: true });
    mkdirSync(join(b, 'dup'), { recursive: true });
    writeFileSync(join(a, 'dup', 'SKILL.md'), '---\nname: dup\n---\nfirst', 'utf8');
    writeFileSync(join(b, 'dup', 'SKILL.md'), '---\nname: dup\n---\nsecond', 'utf8');
    const reg = createSkillRegistry();
    loadSkillsFromParentDir(reg, a);
    loadSkillsFromParentDir(reg, b);
    expect(reg.get('dup')?.body).toBe('second');
  });
});

describe('loadSkillsFromDisk', () => {
  it('includes project skills when only project dir exists', () => {
    const dir = join(projectRoot, '.spark-cli', 'skills', 'only');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: onlyproj\n---\nbody', 'utf8');
    const reg = createSkillRegistry();
    loadSkillsFromDisk(reg, projectRoot);
    expect(reg.get('onlyproj')?.body).toBe('body');
  });
});

describe('findByTrigger', () => {
  it('matches case-insensitively across configured triggers', () => {
    const reg = createSkillRegistry();
    reg.register({
      name: 'tilemap',
      body: 'body',
      triggers: ['tilemap', 'TiledMap'],
    });
    reg.register({
      name: 'audio',
      body: 'b',
      triggers: ['sound', 'audio'],
    });
    expect(reg.findByTrigger('Please draw a TILEMAP for me').map((s) => s.name)).toEqual(['tilemap']);
    expect(reg.findByTrigger('add background AUDIO').map((s) => s.name)).toEqual(['audio']);
    expect(reg.findByTrigger('hello world')).toEqual([]);
  });

  it('matches via regex when triggerPattern is set', () => {
    const reg = createSkillRegistry();
    reg.register({
      name: 'physics',
      body: 'b',
      triggers: [],
      triggerPattern: /rigid\s*body/i,
    });
    expect(reg.findByTrigger('attach a rigid body').map((s) => s.name)).toEqual(['physics']);
    expect(reg.findByTrigger('something else')).toEqual([]);
  });
});
