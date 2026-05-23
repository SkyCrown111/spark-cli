import { describe, it, expect } from 'vitest';
import { processSkillBody, canModelInvoke, canUserInvoke } from './processor.js';
import type { Skill } from './registry.js';

describe('processSkillBody', () => {
  it('replaces $ARGUMENTS', () => {
    const result = processSkillBody('Args: $ARGUMENTS', { arguments: 'hello world' });
    expect(result).toBe('Args: hello world');
  });

  it('replaces $0 and $1 positional args', () => {
    const result = processSkillBody('First: $0, Second: $1', { arguments: 'foo bar' });
    expect(result).toBe('First: foo, Second: bar');
  });

  it('replaces missing positional args with empty string', () => {
    const result = processSkillBody('[$0][$1][$2]', { arguments: 'only-one' });
    expect(result).toBe('[only-one][][]');
  });

  it('replaces ${SPARK_SESSION_ID}', () => {
    const result = processSkillBody('Session: ${SPARK_SESSION_ID}', { sessionId: 'abc-123' });
    expect(result).toBe('Session: abc-123');
  });

  it('replaces ${SPARK_PROJECT_ROOT}', () => {
    const result = processSkillBody('Root: ${SPARK_PROJECT_ROOT}', {
      projectRoot: '/work/project',
    });
    expect(result).toBe('Root: /work/project');
  });

  it('replaces ${SPARK_SKILL_DIR}', () => {
    const result = processSkillBody('Dir: ${SPARK_SKILL_DIR}', { skillDir: '/skills/tilemap' });
    expect(result).toBe('Dir: /skills/tilemap');
  });

  it('handles missing context gracefully', () => {
    const result = processSkillBody('Args: $ARGUMENTS, Session: ${SPARK_SESSION_ID}');
    expect(result).toBe('Args: , Session: ');
  });

  it('executes inline commands', () => {
    const result = processSkillBody('Date: !`echo 2024-01-01`');
    expect(result).toBe('Date: 2024-01-01');
  });

  it('handles command failure gracefully', () => {
    const result = processSkillBody('Result: !`false`');
    expect(result).toMatch(/Result: \[command failed:/);
  });

  it('handles multiple replacements', () => {
    const result = processSkillBody('$0 -> $1 ($ARGUMENTS)', { arguments: 'a b c' });
    expect(result).toBe('a -> b (a b c)');
  });
});

describe('canModelInvoke', () => {
  it('returns true when disableModelInvocation is not set', () => {
    const skill: Skill = { name: 'test', body: '', triggers: [] };
    expect(canModelInvoke(skill)).toBe(true);
  });

  it('returns false when disableModelInvocation is true', () => {
    const skill: Skill = { name: 'test', body: '', triggers: [], disableModelInvocation: true };
    expect(canModelInvoke(skill)).toBe(false);
  });
});

describe('canUserInvoke', () => {
  it('returns true when userInvocable is not set (default)', () => {
    const skill: Skill = { name: 'test', body: '', triggers: [] };
    expect(canUserInvoke(skill)).toBe(true);
  });

  it('returns true when userInvocable is true', () => {
    const skill: Skill = { name: 'test', body: '', triggers: [], userInvocable: true };
    expect(canUserInvoke(skill)).toBe(true);
  });

  it('returns false when userInvocable is false', () => {
    const skill: Skill = { name: 'test', body: '', triggers: [], userInvocable: false };
    expect(canUserInvoke(skill)).toBe(false);
  });
});
