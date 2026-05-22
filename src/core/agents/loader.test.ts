import { describe, it, expect } from 'vitest';
import { parseAgentFile } from './loader.js';

describe('parseAgentFile', () => {
  it('parses frontmatter and body', () => {
    const raw = `---
name: code-reviewer
description: Reviews code for issues
allowedTools: [read_file, glob, grep]
contextMode: fresh
---

You are a code review agent. Focus on finding bugs and security issues.
`;
    const result = parseAgentFile(raw);
    expect(result.frontmatter).toEqual({
      name: 'code-reviewer',
      description: 'Reviews code for issues',
      allowedTools: ['read_file', 'glob', 'grep'],
      contextMode: 'fresh',
    });
    expect(result.body).toBe(
      'You are a code review agent. Focus on finding bugs and security issues.',
    );
  });

  it('handles missing frontmatter', () => {
    const raw = 'Just a plain body without frontmatter.';
    const result = parseAgentFile(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Just a plain body without frontmatter.');
  });

  it('handles empty frontmatter', () => {
    const raw = `---
---

Body text here.`;
    const result = parseAgentFile(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Body text here.');
  });

  it('parses allowedTools with quotes', () => {
    const raw = `---
name: test
allowedTools: ["read_file", "glob"]
---
Body`;
    const result = parseAgentFile(raw);
    expect(result.frontmatter.allowedTools).toEqual(['read_file', 'glob']);
  });

  it('validates contextMode values', () => {
    const raw = `---
name: test
contextMode: invalid
---
Body`;
    const result = parseAgentFile(raw);
    expect(result.frontmatter.contextMode).toBeUndefined();
  });

  it('accepts inherit contextMode', () => {
    const raw = `---
name: test
contextMode: inherit
---
Body`;
    const result = parseAgentFile(raw);
    expect(result.frontmatter.contextMode).toBe('inherit');
  });

  it('accepts fork contextMode', () => {
    const raw = `---
name: test
contextMode: fork
---
Body`;
    const result = parseAgentFile(raw);
    expect(result.frontmatter.contextMode).toBe('fork');
  });
});
