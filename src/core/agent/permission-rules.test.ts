import { describe, it, expect } from 'vitest';
import {
  parseSpecifier,
  specifierMatches,
  evaluateRules,
  extractPathArgs,
  type ToolRule,
} from './permission-rules.js';

describe('parseSpecifier', () => {
  it('parses Tool(bash) — no path pattern', () => {
    const result = parseSpecifier('Tool(bash)');
    expect(result).toEqual({ kind: 'tool', toolPattern: 'bash' });
  });

  it('parses Tool(bash:*) — wildcard path = no path pattern', () => {
    const result = parseSpecifier('Tool(bash:*)');
    expect(result).toEqual({ kind: 'tool', toolPattern: 'bash' });
  });

  it('parses Tool(write_file:src/**) — tool + path glob', () => {
    const result = parseSpecifier('Tool(write_file:src/**)');
    expect(result).toEqual({ kind: 'tool', toolPattern: 'write_file', pathPattern: 'src/**' });
  });

  it('parses Tool(*:.git/*) — wildcard tool + path glob', () => {
    const result = parseSpecifier('Tool(*:.git/*)');
    expect(result).toEqual({ kind: 'tool', toolPattern: '*', pathPattern: '.git/*' });
  });

  it('parses Tool(*) — wildcard tool, no path', () => {
    const result = parseSpecifier('Tool(*)');
    expect(result).toEqual({ kind: 'tool', toolPattern: '*' });
  });

  it('parses Tool(edit_file:*.env) — glob tool name', () => {
    const result = parseSpecifier('Tool(edit_file:*.env)');
    expect(result).toEqual({ kind: 'tool', toolPattern: 'edit_file', pathPattern: '*.env' });
  });

  it('parses Bash(npm run *) — command pattern', () => {
    const result = parseSpecifier('Bash(npm run *)');
    expect(result).toEqual({ kind: 'bash', toolPattern: 'bash', commandPattern: 'npm run *' });
  });

  it('parses Read(~/secrets/**) — read path pattern', () => {
    const result = parseSpecifier('Read(~/secrets/**)');
    expect(result).toEqual({ kind: 'read', toolPattern: 'read_file', pathPattern: '~/secrets/**' });
  });

  it('parses WebFetch(domain:example.com) — domain pattern', () => {
    const result = parseSpecifier('WebFetch(domain:example.com)');
    expect(result).toEqual({
      kind: 'webfetch',
      toolPattern: 'web_fetch',
      domainPattern: 'example.com',
    });
  });

  it('parses Agent(Explore) — agent name pattern', () => {
    const result = parseSpecifier('Agent(Explore)');
    expect(result).toEqual({ kind: 'agent', toolPattern: 'agent', commandPattern: 'Explore' });
  });

  it('parses mcp__server__tool — MCP tool', () => {
    const result = parseSpecifier('mcp__server__tool');
    expect(result).toEqual({ kind: 'mcp', toolPattern: 'mcp__server__tool' });
  });
});

describe('specifierMatches', () => {
  it('matches exact tool name', () => {
    const parsed = parseSpecifier('Tool(bash)');
    expect(specifierMatches(parsed, 'bash', [])).toBe(true);
    expect(specifierMatches(parsed, 'write_file', [])).toBe(false);
  });

  it('matches wildcard tool', () => {
    const parsed = parseSpecifier('Tool(*)');
    expect(specifierMatches(parsed, 'bash', [])).toBe(true);
    expect(specifierMatches(parsed, 'write_file', [])).toBe(true);
  });

  it('matches tool with path glob', () => {
    const parsed = parseSpecifier('Tool(write_file:src/**)');
    expect(specifierMatches(parsed, 'write_file', ['src/foo.ts'])).toBe(true);
    expect(specifierMatches(parsed, 'write_file', ['lib/bar.ts'])).toBe(false);
    expect(specifierMatches(parsed, 'edit_file', ['src/foo.ts'])).toBe(false);
  });

  it('matches wildcard tool with path glob', () => {
    const parsed = parseSpecifier('Tool(*:.git/**)');
    expect(specifierMatches(parsed, 'write_file', ['.git/config'])).toBe(true);
    expect(specifierMatches(parsed, 'bash', ['.git/hooks/pre-commit'])).toBe(true);
    expect(specifierMatches(parsed, 'write_file', ['src/foo.ts'])).toBe(false);
  });

  it('requires path match when pathPattern is specified', () => {
    const parsed = parseSpecifier('Tool(write_file:.env)');
    expect(specifierMatches(parsed, 'write_file', ['.env'])).toBe(true);
    expect(specifierMatches(parsed, 'write_file', [])).toBe(false);
  });

  it('matches glob tool names with minimatch', () => {
    const parsed = parseSpecifier('Tool(bash_*)');
    expect(specifierMatches(parsed, 'bash', [])).toBe(false);
    expect(specifierMatches(parsed, 'bash_background', [])).toBe(true);
  });
});

describe('evaluateRules', () => {
  it('returns first matching rule action', () => {
    const rules: ToolRule[] = [
      { specifier: 'Tool(bash)', action: 'deny' },
      { specifier: 'Tool(write_file:src/**)', action: 'allow' },
    ];
    expect(evaluateRules(rules, 'bash', [])).toBe('deny');
    expect(evaluateRules(rules, 'write_file', ['src/app.ts'])).toBe('allow');
  });

  it('returns undefined when no rule matches', () => {
    const rules: ToolRule[] = [{ specifier: 'Tool(bash)', action: 'deny' }];
    expect(evaluateRules(rules, 'read_file', ['src/foo.ts'])).toBe(undefined);
  });

  it('deny takes precedence when matched first', () => {
    const rules: ToolRule[] = [
      { specifier: 'Tool(write_file:.git/*)', action: 'deny' },
      { specifier: 'Tool(write_file)', action: 'allow' },
    ];
    expect(evaluateRules(rules, 'write_file', ['.git/config'])).toBe('deny');
    expect(evaluateRules(rules, 'write_file', ['src/foo.ts'])).toBe('allow');
  });

  it('wildcard rule matches everything', () => {
    const rules: ToolRule[] = [{ specifier: 'Tool(*)', action: 'ask' }];
    expect(evaluateRules(rules, 'bash', [])).toBe('ask');
    expect(evaluateRules(rules, 'write_file', ['foo.ts'])).toBe('ask');
  });
});

describe('extractPathArgs', () => {
  it('extracts path from common arg names', () => {
    expect(extractPathArgs({ path: 'src/foo.ts' })).toEqual(['src/foo.ts']);
    expect(extractPathArgs({ file_path: '.env' })).toEqual(['.env']);
    expect(extractPathArgs({ filePath: 'config.yaml' })).toEqual(['config.yaml']);
  });

  it('returns empty array when no path args', () => {
    expect(extractPathArgs({ command: 'npm test' })).toEqual([]);
    expect(extractPathArgs({})).toEqual([]);
  });

  it('extracts multiple path keys', () => {
    expect(extractPathArgs({ path: 'src/a.ts', target: 'dist/b.js' })).toEqual([
      'src/a.ts',
      'dist/b.js',
    ]);
  });
});
