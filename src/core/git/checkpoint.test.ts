import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createCheckpoint, rewindToCheckpoint, listCheckpoints, discardCheckpoint } from './checkpoint.js';

const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);

describe('checkpoint', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing checkpoint index
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCheckpoint', () => {
    it('creates a checkpoint with id and timestamp', async () => {
      mockExecSync
        .mockReturnValueOnce('') // git stash push
        .mockReturnValueOnce('stash@{0}: On main: spark-cli-checkpoint:cp-abc\n'); // git stash list

      const result = await createCheckpoint(projectRoot);

      expect(result.id).toMatch(/^cp-/);
      expect(result.timestamp).toBeTruthy();
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('handles empty git working tree gracefully', async () => {
      mockExecSync.mockImplementation(() => { throw new Error('nothing to stash'); });

      const result = await createCheckpoint(projectRoot);

      expect(result.id).toMatch(/^cp-/);
      // Should still save checkpoint even if stash failed
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('rewindToCheckpoint', () => {
    it('returns false for unknown checkpoint', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('[]');

      const result = await rewindToCheckpoint(projectRoot, 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns true for checkpoint without stash ref', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { id: 'cp-test', timestamp: '2024-01-01T00:00:00Z' },
      ]));

      const result = await rewindToCheckpoint(projectRoot, 'cp-test');
      expect(result).toBe(true);
    });

    it('pops stash and removes checkpoint on success', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { id: 'cp-test', timestamp: '2024-01-01T00:00:00Z', stashRef: 'stash@{0}' },
      ]));
      mockExecSync.mockReturnValue('');

      const result = await rewindToCheckpoint(projectRoot, 'cp-test');
      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git stash pop stash@{0}'),
        expect.any(Object),
      );
    });

    it('returns false when git stash pop fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { id: 'cp-test', timestamp: '2024-01-01T00:00:00Z', stashRef: 'stash@{0}' },
      ]));
      mockExecSync.mockImplementation(() => { throw new Error('conflict'); });

      const result = await rewindToCheckpoint(projectRoot, 'cp-test');
      expect(result).toBe(false);
    });
  });

  describe('listCheckpoints', () => {
    it('returns empty array when no index exists', () => {
      mockExistsSync.mockReturnValue(false);
      expect(listCheckpoints(projectRoot)).toEqual([]);
    });

    it('returns parsed checkpoints from index', () => {
      const data = [{ id: 'cp-1', timestamp: '2024-01-01T00:00:00Z' }];
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(data));
      expect(listCheckpoints(projectRoot)).toEqual(data);
    });
  });

  describe('discardCheckpoint', () => {
    it('returns false for unknown checkpoint', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('[]');
      expect(discardCheckpoint(projectRoot, 'nope')).toBe(false);
    });

    it('removes checkpoint from index', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { id: 'cp-1', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'cp-2', timestamp: '2024-01-02T00:00:00Z' },
      ]));

      const result = discardCheckpoint(projectRoot, 'cp-1');
      expect(result).toBe(true);
      // Should write updated index without cp-1
      const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string);
      expect(written).toHaveLength(1);
      expect(written[0].id).toBe('cp-2');
    });
  });
});
