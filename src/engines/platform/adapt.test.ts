import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../../config/schema.js';
import { runPlatformAdapt } from './adapt.js';
import { analyzePlatformBuild } from './build-analyzer.js';
import { loadPlatformRules, compareToLimits } from '../../core/validate/platform-rules.js';

const fixture = join(process.cwd(), 'fixtures/cocos-3.8-mini');

describe('platform adapt', () => {
  it('analyzes douyin fixture build', () => {
    const sizes = analyzePlatformBuild(fixture, 'douyin');
    expect(sizes.mainBytes).toBeGreaterThan(0);
    expect(sizes.subpackages.length).toBe(1);
  });

  it('douyin adapt passes fixture limits', () => {
    const sizes = analyzePlatformBuild(fixture, 'douyin');
    const rules = loadPlatformRules('douyin', fixture);
    const checks = compareToLimits(sizes, rules);
    expect(checks.filter((c) => !c.ok && c.severity === 'error')).toHaveLength(0);
  });

  it('reports missing appid for douyin', () => {
    const report = runPlatformAdapt('douyin', fixture, DEFAULT_CONFIG);
    expect(report.issues.some((i) => i.id === 'missing_appid')).toBe(true);
  });
});
