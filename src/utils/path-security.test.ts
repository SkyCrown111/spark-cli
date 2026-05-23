import { describe, it, expect } from 'vitest';
import { validatePath, validatePathOrThrow } from './path-security.js';

const projectRoot = '/project';

/** Normalize path separators for cross-platform test assertions. */
function normalizeSep(p: string): string {
  return p.replace(/\\/g, '/');
}

describe('validatePath', () => {
  it('accepts valid relative path', () => {
    const result = validatePath('src/index.ts', projectRoot);
    expect(result.ok).toBe(true);
    expect(normalizeSep(result.relative)).toBe('src/index.ts');
  });

  it('strips surrounding double quotes', () => {
    const result = validatePath('"src/index.ts"', projectRoot);
    expect(result.ok).toBe(true);
    expect(normalizeSep(result.relative)).toBe('src/index.ts');
  });

  it('strips surrounding single quotes', () => {
    const result = validatePath("'src/index.ts'", projectRoot);
    expect(result.ok).toBe(true);
    expect(normalizeSep(result.relative)).toBe('src/index.ts');
  });

  it('rejects empty path', () => {
    const result = validatePath('', projectRoot);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('non-empty string');
  });

  it('rejects whitespace-only path', () => {
    const result = validatePath('   ', projectRoot);
    expect(result.ok).toBe(false);
  });

  it('rejects path traversal by default', () => {
    const result = validatePath('../escape.txt', projectRoot);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('escapes project root');
  });

  it('allows path traversal when allowOutside is set', () => {
    const result = validatePath('../escape.txt', projectRoot, { allowOutside: true });
    expect(result.ok).toBe(true);
  });

  it('rejects absolute paths by default', () => {
    const result = validatePath('/etc/passwd', projectRoot);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Absolute paths');
  });

  it('allows absolute paths when allowAbsolute is set', () => {
    const result = validatePath('/tmp/test.txt', projectRoot, { allowAbsolute: true });
    expect(result.ok).toBe(true);
  });

  it('normalizes nested traversal', () => {
    const result = validatePath('src/../../escape.txt', projectRoot);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('escapes project root');
  });

  it('handles Windows-style paths', () => {
    const result = validatePath('src\\index.ts', projectRoot);
    expect(result.ok).toBe(true);
  });

  it('strips leading slash for Unix-style paths', () => {
    const result = validatePath('/assets/texture.png', projectRoot);
    expect(result.ok).toBe(false); // absolute path check
  });
});

describe('validatePathOrThrow', () => {
  it('returns resolved path on success', () => {
    const result = validatePathOrThrow('src/index.ts', projectRoot);
    expect(normalizeSep(result.relative)).toBe('src/index.ts');
  });

  it('throws on invalid path', () => {
    expect(() => validatePathOrThrow('../escape.txt', projectRoot)).toThrow();
  });
});
