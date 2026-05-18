import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { analyzeWechatBuild } from './build-analyzer.js';
import { compareToLimits, loadWechatRules } from '../../core/validate/wechat-limits.js';

const fixture = join(process.cwd(), 'fixtures/cocos-3.8-mini');

describe('wechat build analyzer', () => {
  it('reports main and subpackage sizes', () => {
    const sizes = analyzeWechatBuild(fixture);
    expect(sizes.mainBytes).toBeGreaterThan(0);
    expect(sizes.subpackages.length).toBe(1);
    expect(sizes.subpackages[0].name).toBe('resources');
    expect(sizes.totalBytes).toBe(sizes.mainBytes + sizes.subpackages[0].bytes);
  });

  it('passes fixture against default limits', () => {
    const sizes = analyzeWechatBuild(fixture);
    const rules = loadWechatRules(fixture);
    const checks = compareToLimits(sizes, rules);
    expect(checks.filter((c) => c.severity === 'error' && !c.ok)).toHaveLength(0);
  });
});
