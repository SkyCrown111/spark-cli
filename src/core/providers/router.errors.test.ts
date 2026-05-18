import { describe, expect, it } from 'vitest';
import { resolveModelForTask } from './router.js';
import { SparkCLIError } from '../../utils/errors.js';

describe('resolveModelForTask errors', () => {
  it('throws when no model configured', () => {
    expect(() => resolveModelForTask({}, 'chat')).toThrow(SparkCLIError);
  });

  it('throws exit code 2 when API key missing', () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      resolveModelForTask(
        { model: { default: 'gpt-4o', provider: 'openai' } },
        'chat',
      );
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SparkCLIError);
      expect((e as SparkCLIError).code).toBe(2);
    } finally {
      if (prev) process.env.OPENAI_API_KEY = prev;
    }
  });
});
