import type { PlatformRules, PackageSizeReport, LimitCheck } from './platform-rules.js';
import {
  compareToLimits,
  formatBytes,
  loadPlatformRules,
  getBuiltinRulesPath as getPlatformBuiltinRulesPath,
} from './platform-rules.js';

export type WechatRules = PlatformRules;

export type { PackageSizeReport, LimitCheck };

export function loadWechatRules(projectRoot?: string): WechatRules {
  return loadPlatformRules('wechat', projectRoot);
}

export function getBuiltinRulesPath(): string {
  return getPlatformBuiltinRulesPath('wechat');
}

export { compareToLimits, formatBytes };
