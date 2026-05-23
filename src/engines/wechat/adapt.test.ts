import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyWechatAdaptFixes, type AdaptReport } from './adapt.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'spark-wechat-adapt-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('applyWechatAdaptFixes', () => {
  it('writes reports under .spark', () => {
    const report: AdaptReport = {
      ok: false,
      buildFound: true,
      issues: [
        {
          id: 'main_package',
          severity: 'error',
          category: 'package',
          message: 'Too large',
          fixable: true,
        },
      ],
      suggestions: [
        {
          name: 'resources',
          root: 'subpackages/resources/',
          reason: 'Move shared assets',
          estimatedAssets: ['assets/resources/a.png'],
        },
      ],
    };

    const result = applyWechatAdaptFixes(projectRoot, report);

    expect(result.reportPath).toBe(join(projectRoot, '.spark', 'wechat-adapt-report.json'));
    expect(existsSync(result.reportPath)).toBe(true);
    expect(existsSync(join(projectRoot, '.spark-cli', 'wechat-adapt-report.json'))).toBe(false);

    const written = JSON.parse(readFileSync(result.reportPath, 'utf8')) as AdaptReport;
    expect(written.issues[0]?.id).toBe('main_package');

    const snippetPath = join(projectRoot, '.spark', 'wechat-subpackages-suggested.json');
    expect(existsSync(snippetPath)).toBe(true);
    expect(readFileSync(snippetPath, 'utf8')).toContain('"root": "subpackages/resources/"');
  });
});
