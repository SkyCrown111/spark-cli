import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { createPr, getPrStatus, loadPrContext } from './pr-ops.js';

const mockExecSync = vi.mocked(execSync);

describe('pr-ops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPr', () => {
    it('parses PR URL and number from gh output', () => {
      mockExecSync.mockReturnValue('https://github.com/owner/repo/pull/42\n');
      const result = createPr('feat: new thing', 'body text');
      expect(result.url).toBe('https://github.com/owner/repo/pull/42');
      expect(result.number).toBe(42);
    });

    it('passes base flag when specified', () => {
      mockExecSync.mockReturnValue('https://github.com/o/r/pull/1\n');
      createPr('title', 'body', { base: 'develop' });
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--base "develop"'),
        expect.any(Object),
      );
    });

    it('throws when gh command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('gh not found');
      });
      expect(() => createPr('t', 'b')).toThrow('gh not found');
    });
  });

  describe('getPrStatus', () => {
    it('parses state and url from gh pr view JSON', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({ state: 'MERGED', url: 'https://github.com/o/r/pull/5' }),
      );
      const status = getPrStatus(5);
      expect(status.status).toBe('MERGED');
      expect(status.url).toBe('https://github.com/o/r/pull/5');
    });

    it('handles missing fields gracefully', () => {
      mockExecSync.mockReturnValue('{}');
      const status = getPrStatus(1);
      expect(status.status).toBe('UNKNOWN');
      expect(status.url).toBe('');
    });
  });

  describe('loadPrContext', () => {
    it('combines diff and comments into context string', () => {
      mockExecSync
        .mockReturnValueOnce('diff --git a/foo.ts\n+added line')
        .mockReturnValueOnce('LGTM')
        .mockReturnValueOnce('Looks good!');

      const ctx = loadPrContext(10);
      expect(ctx).toContain('PR #10 Diff');
      expect(ctx).toContain('diff --git a/foo.ts');
      expect(ctx).toContain('LGTM');
      expect(ctx).toContain('Looks good!');
    });

    it('handles missing diff gracefully', () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('no diff');
        })
        .mockReturnValueOnce('')
        .mockReturnValueOnce('');

      const ctx = loadPrContext(99);
      expect(ctx).toContain('diff unavailable');
    });
  });
});
