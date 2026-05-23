import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';

describe('Logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.setLevel('info');
    logger.setJsonMode(false);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('defaults to info level', () => {
    expect(logger.getLevel()).toBe('info');
  });

  it('respects level changes', () => {
    logger.setLevel('debug');
    expect(logger.getLevel()).toBe('debug');
  });

  describe('debug', () => {
    it('suppressed at info level', () => {
      logger.debug('test');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('shown at debug level', () => {
      logger.setLevel('debug');
      logger.debug('test');
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('shown at info level', () => {
      logger.info('hello');
      expect(logSpy).toHaveBeenCalledWith('hello');
    });

    it('suppressed at warn level', () => {
      logger.setLevel('warn');
      logger.info('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('shown at info level', () => {
      logger.warn('caution');
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('always shown unless json mode', () => {
      logger.error('fail');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('outputs JSON in json mode', () => {
      logger.setJsonMode(true);
      logger.error('fail');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"fail"'));
    });
  });

  describe('json mode', () => {
    it('suppresses info output', () => {
      logger.setJsonMode(true);
      logger.info('should not appear');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('json() always outputs', () => {
      logger.setJsonMode(true);
      logger.json({ key: 'value' });
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ key: 'value' }, null, 2));
    });
  });
});
