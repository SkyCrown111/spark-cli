import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileTool, resolveProjectPath, normalizeRawToolPath } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { listDirTool } from './list-dir.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import type { ToolContext } from '../tool-registry.js';

let projectRoot: string;
function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot,
    config: {} as never,
    writeMode: 'staging',
    mode: 'normal',
    agentId: 'a1',
    depth: 0,
    ...overrides,
  };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-cli-tools-'));
  mkdirSync(join(projectRoot, 'src'), { recursive: true });
});

describe('read_file', () => {
  it('reads a small file with line numbers', async () => {
    writeFileSync(join(projectRoot, 'a.ts'), 'one\ntwo\nthree\n', 'utf8');
    const r = await readFileTool.handler({ path: 'a.ts' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/^1\tone$/m);
    expect(r.content).toMatch(/^3\tthree$/m);
  });

  it('refuses paths outside the project root', async () => {
    const r = await readFileTool.handler({ path: '../../etc/passwd' }, ctx());
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/escapes/i);
  });

  it('refuses paths inside .spark/', async () => {
    const r = await readFileTool.handler({ path: '.spark/staging/manifest.json' }, ctx());
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/\.spark\//);
  });

  it('accepts Unix-style /assets/ paths on Windows', async () => {
    mkdirSync(join(projectRoot, 'assets'), { recursive: true });
    writeFileSync(join(projectRoot, 'assets', 'foo.txt'), 'ok\n', 'utf8');
    const r = await readFileTool.handler({ path: '/assets/foo.txt' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/ok/);
  });

  it('accepts absolute paths inside the project root', async () => {
    writeFileSync(join(projectRoot, 'inner.ts'), 'inside\n', 'utf8');
    const abs = join(projectRoot, 'inner.ts');
    const r = await readFileTool.handler({ path: abs }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/inside/);
  });

  it('normalizes leading ./ and backslashes', () => {
    expect(normalizeRawToolPath('.\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizeRawToolPath('./src/a.ts')).toBe('src/a.ts');
  });
});

describe('resolveProjectPath', () => {
  it('maps /assets/... to project-relative on Windows', () => {
    mkdirSync(join(projectRoot, 'assets'), { recursive: true });
    writeFileSync(join(projectRoot, 'assets', 'x.txt'), '', 'utf8');
    const r = resolveProjectPath(ctx(), '/assets/x.txt');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rel.replace(/\\/g, '/')).toBe('assets/x.txt');
  });
});

describe('write_file', () => {
  it('stages by default and does not touch the project tree', async () => {
    const r = await writeFileTool.handler({ path: 'src/Hello.ts', content: '// hi\n' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(existsSync(join(projectRoot, 'src/Hello.ts'))).toBe(false);
    const staged = join(projectRoot, '.spark/staging/files/src/Hello.ts');
    expect(existsSync(staged)).toBe(true);
    expect(readFileSync(staged, 'utf8')).toBe('// hi\n');
  });

  it('writes directly when ctx.writeMode is "direct"', async () => {
    const r = await writeFileTool.handler(
      { path: 'src/Direct.ts', content: 'direct\n' },
      ctx({ writeMode: 'direct' }),
    );
    expect(r.isError).toBeFalsy();
    expect(readFileSync(join(projectRoot, 'src/Direct.ts'), 'utf8')).toBe('direct\n');
  });
});

describe('edit_file', () => {
  it('applies a single unique-match edit via staging', async () => {
    writeFileSync(join(projectRoot, 'src/x.ts'), 'export const NAME = "old";\n', 'utf8');
    const r = await editFileTool.handler(
      { path: 'src/x.ts', old_string: '"old"', new_string: '"new"' },
      ctx(),
    );
    expect(r.isError).toBeFalsy();
    const staged = readFileSync(join(projectRoot, '.spark/staging/files/src/x.ts'), 'utf8');
    expect(staged).toContain('"new"');
  });

  it('returns model-readable error when old_string matches multiple times', async () => {
    writeFileSync(join(projectRoot, 'src/y.ts'), 'a\na\na\n', 'utf8');
    const r = await editFileTool.handler(
      { path: 'src/y.ts', old_string: 'a', new_string: 'b' },
      ctx(),
    );
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/3 places/);
  });

  it('returns model-readable error when old_string is not found', async () => {
    writeFileSync(join(projectRoot, 'src/z.ts'), 'hello\n', 'utf8');
    const r = await editFileTool.handler(
      { path: 'src/z.ts', old_string: 'zzz', new_string: 'qq' },
      ctx(),
    );
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/not found/);
  });

  it('applies multiple edits in order', async () => {
    writeFileSync(join(projectRoot, 'src/m.ts'), 'A=1\nB=2\n', 'utf8');
    const r = await editFileTool.handler(
      {
        path: 'src/m.ts',
        edits: [
          { old_string: 'A=1', new_string: 'A=10' },
          { old_string: 'B=2', new_string: 'B=20' },
        ],
      },
      ctx({ writeMode: 'direct' }),
    );
    expect(r.isError).toBeFalsy();
    expect(readFileSync(join(projectRoot, 'src/m.ts'), 'utf8')).toBe('A=10\nB=20\n');
  });
});

describe('list_dir', () => {
  it('lists entries with size annotations and skips ignored dirs', async () => {
    writeFileSync(join(projectRoot, 'a.txt'), 'hello', 'utf8');
    mkdirSync(join(projectRoot, 'sub'));
    mkdirSync(join(projectRoot, '.git'));
    mkdirSync(join(projectRoot, '.spark'));
    const r = await listDirTool.handler({ path: '.' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/a\.txt\s+\(5 bytes\)/);
    expect(r.content).toMatch(/sub\/\s+\(dir\)/);
    expect(r.content).not.toMatch(/\.git/);
    expect(r.content).not.toMatch(/\.spark/);
  });
});

describe('glob', () => {
  it('matches files by pattern', async () => {
    writeFileSync(join(projectRoot, 'src/a.ts'), '');
    writeFileSync(join(projectRoot, 'src/b.js'), '');
    mkdirSync(join(projectRoot, 'src/nested'));
    writeFileSync(join(projectRoot, 'src/nested/c.ts'), '');
    const r = await globTool.handler({ pattern: 'src/**/*.ts' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('src/a.ts');
    expect(r.content).toContain('src/nested/c.ts');
    expect(r.content).not.toContain('b.js');
  });

  it('skips files under .spark', async () => {
    mkdirSync(join(projectRoot, '.spark'), { recursive: true });
    writeFileSync(join(projectRoot, '.spark', 'hidden.ts'), '', 'utf8');
    const r = await globTool.handler({ pattern: '**/*.ts' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).not.toContain('.spark/hidden.ts');
  });
});

describe('grep', () => {
  it('finds lines matching the regex', async () => {
    writeFileSync(join(projectRoot, 'src/a.ts'), 'function foo() {}\nconst bar = 1;\n', 'utf8');
    writeFileSync(join(projectRoot, 'src/b.ts'), 'function baz() {}\n', 'utf8');
    const r = await grepTool.handler({ pattern: 'function\\s+\\w+', glob: 'src/**/*.ts' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/src\/a\.ts:1:.*foo/);
    expect(r.content).toMatch(/src\/b\.ts:1:.*baz/);
  });

  it('returns no matches gracefully', async () => {
    writeFileSync(join(projectRoot, 'src/a.ts'), 'nothing here\n', 'utf8');
    const r = await grepTool.handler({ pattern: 'XYZNOMATCH', glob: 'src/**/*.ts' }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/no matches/);
  });
});
