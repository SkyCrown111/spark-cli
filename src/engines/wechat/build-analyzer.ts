import type { PackageSizeReport } from '../../core/validate/platform-rules.js';
import { analyzePlatformBuild, findPlatformBuildDir } from '../platform/build-analyzer.js';

export type { PackageSizeReport };

export function findWechatBuildDir(projectRoot: string): string | null {
  return findPlatformBuildDir(projectRoot, 'wechat');
}

export function analyzeWechatBuild(projectRoot: string): PackageSizeReport {
  return analyzePlatformBuild(projectRoot, 'wechat');
}
