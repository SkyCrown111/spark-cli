import { describe, it, expect } from 'vitest';
import { SparkCLIError, getErrorMessage, safeExecute, safeExecuteAsync } from './errors.js';

describe('SparkCLIError', () => {
  it('creates error with message', () => {
    const err = new SparkCLIError('test error');
    expect(err.message).toBe('test error');
    expect(err.code).toBe(1);
    expect(err.hints).toEqual([]);
    expect(err.name).toBe('SparkCLIError');
  });

  it('creates error with custom code and hints', () => {
    const err = new SparkCLIError('failed', 2, ['hint 1', 'hint 2']);
    expect(err.code).toBe(2);
    expect(err.hints).toEqual(['hint 1', 'hint 2']);
  });

  it('supports cause chain', () => {
    const cause = new Error('root cause');
    const err = new SparkCLIError('wrapped', 1, [], cause);
    expect(err.cause).toBe(cause);
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('test'))).toBe('test');
  });

  it('returns string as-is', () => {
    expect(getErrorMessage('direct string')).toBe('direct string');
  });

  it('converts non-string non-Error to string', () => {
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});

describe('safeExecute', () => {
  it('returns function result on success', () => {
    expect(safeExecute(() => 42, 0)).toBe(42);
  });

  it('returns fallback on error', () => {
    expect(
      safeExecute(() => {
        throw new Error('fail');
      }, 0),
    ).toBe(0);
  });

  it('returns fallback on non-Error throw', () => {
    expect(
      safeExecute(() => {
        throw 'string error';
      }, 'fallback'),
    ).toBe('fallback');
  });
});

describe('safeExecuteAsync', () => {
  it('returns resolved value on success', async () => {
    const result = await safeExecuteAsync(async () => 42, 0);
    expect(result).toBe(42);
  });

  it('returns fallback on rejection', async () => {
    const result = await safeExecuteAsync(async () => {
      throw new Error('fail');
    }, 0);
    expect(result).toBe(0);
  });

  it('returns fallback on sync throw in async fn', async () => {
    const result = await safeExecuteAsync(() => {
      throw new Error('sync');
    }, 'fb');
    expect(result).toBe('fb');
  });
});
