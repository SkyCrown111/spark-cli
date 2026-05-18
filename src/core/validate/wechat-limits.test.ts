import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { loadWechatRules } from './wechat-limits.js';

describe('wechat-limits hot reload', () => {
  it('prefers project .spark-cli/rules/wechat.json', () => {
    const tmp = join(process.cwd(), 'fixtures/cocos-3.8-mini/.spark-cli/rules');
    mkdirSync(tmp, { recursive: true });
    const customPath = join(tmp, 'wechat.json');
    const builtin = loadWechatRules();
    const custom = {
      ...builtin,
      limits: { ...builtin.limits, mainPackageBytes: 1024 },
    };
    writeFileSync(customPath, JSON.stringify(custom), 'utf8');

    const loaded = loadWechatRules(join(process.cwd(), 'fixtures/cocos-3.8-mini'));
    expect(loaded.limits.mainPackageBytes).toBe(1024);

    rmSync(customPath);
  });
});
