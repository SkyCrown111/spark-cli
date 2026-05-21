import { describe, it, expect } from 'vitest';
import { generateCommitMessage } from './auto-commit.js';

describe('generateCommitMessage', () => {
  it('generates message for single created file', () => {
    const msg = generateCommitMessage({
      files: [{ path: 'src/foo.ts', action: 'create' }],
    });
    expect(msg).toContain('chore: add src/foo.ts');
    expect(msg).toContain('Co-Authored-By: SparkCLI');
    expect(msg).toContain('create: src/foo.ts');
  });

  it('generates message for single modified file', () => {
    const msg = generateCommitMessage({
      files: [{ path: 'src/bar.ts', action: 'modify' }],
    });
    expect(msg).toContain('chore: update src/bar.ts');
    expect(msg).toContain('modify: src/bar.ts');
  });

  it('generates message for single deleted file', () => {
    const msg = generateCommitMessage({
      files: [{ path: 'src/old.ts', action: 'delete' }],
    });
    expect(msg).toContain('chore: remove src/old.ts');
    expect(msg).toContain('delete: src/old.ts');
  });

  it('generates message for multiple files of mixed actions', () => {
    const msg = generateCommitMessage({
      files: [
        { path: 'a.ts', action: 'create' },
        { path: 'b.ts', action: 'create' },
        { path: 'c.ts', action: 'modify' },
        { path: 'd.ts', action: 'delete' },
      ],
    });
    expect(msg).toContain('add 2 files');
    // Single file of a type uses singular form with file name
    expect(msg).toContain('update c.ts');
    expect(msg).toContain('remove d.ts');
    expect(msg).toContain('create: a.ts');
    expect(msg).toContain('create: b.ts');
    expect(msg).toContain('modify: c.ts');
    expect(msg).toContain('delete: d.ts');
  });

  it('generates fallback message for empty manifest', () => {
    const msg = generateCommitMessage({ files: [] });
    expect(msg).toContain('chore: apply staged changes');
    expect(msg).toContain('Co-Authored-By: SparkCLI');
  });

  it('includes co-author attribution', () => {
    const msg = generateCommitMessage({
      files: [{ path: 'x.ts', action: 'create' }],
    });
    expect(msg).toContain('Co-Authored-By: SparkCLI <noreply@spark-cli.dev>');
  });
});
