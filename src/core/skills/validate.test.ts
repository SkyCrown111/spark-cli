import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSkills } from './validate.js';
import { DEFAULT_CONFIG } from '../../config/schema.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-validate-skills-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function writeProjectSkill(name: string, raw: string): void {
  const dir = join(projectRoot, '.spark', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), raw, 'utf8');
}

describe('validateSkills', () => {
  it('reports invalid triggerPattern', () => {
    writeProjectSkill(
      'badpat',
      ['---', 'name: badpat', 'triggerPattern: [', '---', 'body'].join('\n'),
    );
    const r = validateSkills(projectRoot, DEFAULT_CONFIG);
    expect(r.errors.some((e) => e.includes('invalid triggerPattern'))).toBe(true);
  });

  it('passes for a minimal valid skill', () => {
    writeProjectSkill(
      'ok',
      ['---', 'name: ok', 'triggers: [test]', 'allowedTools: [read_file]', '---', 'body'].join(
        '\n',
      ),
    );
    const r = validateSkills(projectRoot, DEFAULT_CONFIG);
    expect(r.errors).toEqual([]);
  });
});
