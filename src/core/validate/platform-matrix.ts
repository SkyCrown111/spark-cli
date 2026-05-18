/**
 * Cross-platform minigame limits matrix (wechat / douyin / alipay / huawei).
 */

import {
  compareToLimits,
  loadPlatformRules,
  type LimitCheck,
  type PlatformId,
} from './platform-rules.js';
import { findPlatformBuildDir, analyzePlatformBuild } from '../../engines/platform/build-analyzer.js';

export type MatrixStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface PlatformMatrixRow {
  platform: PlatformId;
  rule: string;
  status: MatrixStatus;
  message: string;
  actual?: number;
  limit?: number;
}

const PLATFORMS: PlatformId[] = ['wechat', 'douyin', 'alipay', 'huawei'];

function checkToStatus(c: LimitCheck): MatrixStatus {
  if (c.ok) return c.severity === 'warn' ? 'warn' : 'pass';
  return c.severity === 'error' ? 'fail' : 'warn';
}

export function runPlatformMatrix(projectRoot: string): PlatformMatrixRow[] {
  const rows: PlatformMatrixRow[] = [];

  for (const platform of PLATFORMS) {
    try {
      loadPlatformRules(platform, projectRoot);
    } catch {
      rows.push({
        platform,
        rule: 'rules_missing',
        status: 'skip',
        message: `rules/${platform}.json not found`,
      });
      continue;
    }

    const buildDir = findPlatformBuildDir(projectRoot, platform);
    if (!buildDir) {
      rows.push({
        platform,
        rule: 'build_missing',
        status: 'skip',
        message: 'No platform build output — run platform build first',
      });
      continue;
    }

    const sizes = analyzePlatformBuild(projectRoot, platform);
    const rules = loadPlatformRules(platform, projectRoot);
    const checks = compareToLimits(sizes, rules);
    for (const c of checks) {
      rows.push({
        platform,
        rule: c.id,
        status: checkToStatus(c),
        message: c.message,
        actual: c.actual,
        limit: c.limit,
      });
    }
  }

  return rows;
}
