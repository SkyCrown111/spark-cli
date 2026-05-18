import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareToLimits,
  formatBytes,
  loadPlatformRules,
  type LimitCheck,
  type PlatformId,
} from '../../core/validate/platform-rules.js';
import { getPlatform } from '../../platforms/registry.js';
import { analyzePlatformBuild, findPlatformBuildDir } from './build-analyzer.js';
import { parseCocosScene } from '../cocos/scene-parser.js';
import { findSceneFiles } from '../cocos/scene-list.js';
import type { SparkCLIConfig } from '../../config/schema.js';

export interface AdaptIssue {
  id: string;
  severity: 'error' | 'warn' | 'info';
  category: 'package' | 'assets' | 'scene' | 'config';
  message: string;
}

export interface AdaptReport {
  platform: PlatformId;
  ok: boolean;
  buildFound: boolean;
  sizes?: ReturnType<typeof analyzePlatformBuild>;
  limitChecks?: LimitCheck[];
  issues: AdaptIssue[];
}

function platformConfig(config: SparkCLIConfig, platform: PlatformId) {
  if (platform === 'wechat') return config.wechat;
  if (platform === 'douyin') return config.douyin;
  if (platform === 'alipay') return config.alipay;
  if (platform === 'huawei') return config.huawei;
  return undefined;
}

function findLargeTextures(
  projectRoot: string,
  minBytes: number,
): { path: string; bytes: number }[] {
  const out: { path: string; bytes: number }[] = [];
  const texDir = join(projectRoot, 'assets');
  if (!existsSync(texDir)) return out;

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(png|jpg|jpeg|webp)$/i.test(name) && st.size >= minBytes) {
        out.push({
          path: full.replace(projectRoot, '').replace(/^[/\\]/, ''),
          bytes: st.size,
        });
      }
    }
  }

  walk(texDir);
  return out.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
}

export function runPlatformAdapt(
  platform: PlatformId,
  projectRoot: string,
  config: SparkCLIConfig,
): AdaptReport {
  const def = getPlatform(platform)!;
  const rules = loadPlatformRules(platform, projectRoot);
  const issues: AdaptIssue[] = [];
  let sizes;
  let limitChecks: LimitCheck[] | undefined;
  const buildFound = Boolean(findPlatformBuildDir(projectRoot, platform));

  if (buildFound) {
    sizes = analyzePlatformBuild(projectRoot, platform);
    limitChecks = compareToLimits(sizes, rules);
    for (const c of limitChecks) {
      if (c.ok && c.severity === 'info') continue;
      issues.push({
        id: c.id,
        severity: c.severity === 'error' ? 'error' : 'warn',
        category: 'package',
        message: c.message,
      });
    }
  } else {
    issues.push({
      id: 'no_build',
      severity: 'warn',
      category: 'package',
      message: `No build/${def.buildDirNames[0]} — build for ${def.label} before package checks`,
    });
  }

  const textureWarn = rules.thresholds?.textureWarnBytes ?? 512 * 1024;
  for (const large of findLargeTextures(projectRoot, textureWarn)) {
    issues.push({
      id: `large_texture_${large.path}`,
      severity: 'warn',
      category: 'assets',
      message: `Large texture ${large.path} (${formatBytes(large.bytes)})`,
    });
  }

  const maxNodes = rules.thresholds?.startupSceneMaxNodes ?? 80;
  for (const scene of findSceneFiles(projectRoot).slice(0, 3)) {
    try {
      const analysis = parseCocosScene(join(projectRoot, scene));
      if (analysis.nodeCount > maxNodes) {
        issues.push({
          id: `scene_nodes_${scene}`,
          severity: 'warn',
          category: 'scene',
          message: `${scene}: ${analysis.nodeCount} nodes (suggest ≤ ${maxNodes} for first screen)`,
        });
      }
    } catch {
      /* skip */
    }
  }

  if (rules.requirements?.appidRequired) {
    const pc = platformConfig(config, platform);
    const envKey = def.envAppId;
    const appid = pc?.appid ?? (envKey ? process.env[envKey] : undefined);
    if (!appid) {
      issues.push({
        id: 'missing_appid',
        severity: 'warn',
        category: 'config',
        message: `Set ${platform}.appid in spark-cli.config.yaml or ${envKey} env`,
      });
    }
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { platform, ok, buildFound, sizes, limitChecks, issues };
}

export function applyPlatformAdaptFixes(
  platform: PlatformId,
  projectRoot: string,
  report: AdaptReport,
): { applied: string[]; reportPath: string } {
  const sparkDir = join(projectRoot, '.spark-cli');
  mkdirSync(sparkDir, { recursive: true });
  const reportPath = join(sparkDir, `${platform}-adapt-report.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return { applied: [`Wrote ${reportPath}`], reportPath };
}
