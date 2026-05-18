import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export type PlatformId = 'wechat' | 'douyin' | 'alipay' | 'huawei';

export interface PlatformRules {
  version: number;
  platform?: string;
  updated?: string;
  limits: {
    mainPackageBytes: number;
    subPackageBytes: number;
    totalPackageBytes: number;
    maxSubpackages: number;
  };
  thresholds?: {
    mainPackageWarnRatio?: number;
    textureWarnBytes?: number;
    startupSceneMaxNodes?: number;
  };
  requirements?: {
    appidRequired?: boolean;
  };
}

export interface PackageSizeReport {
  buildDir: string;
  mainBytes: number;
  subpackages: { name: string; root: string; bytes: number }[];
  totalBytes: number;
  fileCount: number;
}

export interface LimitCheck {
  id: string;
  severity: 'error' | 'warn' | 'info';
  ok: boolean;
  message: string;
  actual?: number;
  limit?: number;
}

function ruleCandidates(projectRoot: string, platform: PlatformId): string[] {
  return [
    join(projectRoot, '.spark-cli', 'rules', `${platform}.json`),
    join(projectRoot, 'rules', `${platform}.json`),
  ];
}

export function getBuiltinRulesPath(platform: PlatformId): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = `${platform}.json`;
  const candidates = [
    join(here, 'rules', file),
    join(here, '..', 'rules', file),
    join(here, '..', '..', '..', 'rules', file),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return join(here, '..', 'rules', file);
}

export function loadPlatformRules(
  platform: PlatformId,
  projectRoot?: string,
): PlatformRules {
  const paths = projectRoot
    ? [...ruleCandidates(projectRoot, platform), getBuiltinRulesPath(platform)]
    : [getBuiltinRulesPath(platform)];
  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8')) as PlatformRules;
    }
  }
  throw new Error(`${platform} rules not found (rules/${platform}.json)`);
}

export function compareToLimits(
  sizes: PackageSizeReport,
  rules: PlatformRules,
): LimitCheck[] {
  const checks: LimitCheck[] = [];
  const { limits, thresholds } = rules;

  const mainOk = sizes.mainBytes <= limits.mainPackageBytes;
  checks.push({
    id: 'main_package',
    severity: mainOk ? 'info' : 'error',
    ok: mainOk,
    message: mainOk
      ? `Main package ${formatBytes(sizes.mainBytes)} within ${formatBytes(limits.mainPackageBytes)}`
      : `Main package ${formatBytes(sizes.mainBytes)} exceeds ${formatBytes(limits.mainPackageBytes)}`,
    actual: sizes.mainBytes,
    limit: limits.mainPackageBytes,
  });

  const warnRatio = thresholds?.mainPackageWarnRatio ?? 0.85;
  if (mainOk && sizes.mainBytes > limits.mainPackageBytes * warnRatio) {
    checks.push({
      id: 'main_package_warn',
      severity: 'warn',
      ok: false,
      message: `Main package at ${Math.round((sizes.mainBytes / limits.mainPackageBytes) * 100)}% of limit`,
      actual: sizes.mainBytes,
      limit: limits.mainPackageBytes,
    });
  }

  for (const sub of sizes.subpackages) {
    const subOk = sub.bytes <= limits.subPackageBytes;
    checks.push({
      id: `subpackage_${sub.name}`,
      severity: subOk ? 'info' : 'error',
      ok: subOk,
      message: subOk
        ? `Subpackage "${sub.name}" ${formatBytes(sub.bytes)} OK`
        : `Subpackage "${sub.name}" ${formatBytes(sub.bytes)} exceeds ${formatBytes(limits.subPackageBytes)}`,
      actual: sub.bytes,
      limit: limits.subPackageBytes,
    });
  }

  if (sizes.subpackages.length > limits.maxSubpackages) {
    checks.push({
      id: 'subpackage_count',
      severity: 'error',
      ok: false,
      message: `${sizes.subpackages.length} subpackages exceeds max ${limits.maxSubpackages}`,
      actual: sizes.subpackages.length,
      limit: limits.maxSubpackages,
    });
  }

  const totalOk = sizes.totalBytes <= limits.totalPackageBytes;
  checks.push({
    id: 'total_package',
    severity: totalOk ? 'info' : 'error',
    ok: totalOk,
    message: totalOk
      ? `Total ${formatBytes(sizes.totalBytes)} within ${formatBytes(limits.totalPackageBytes)}`
      : `Total ${formatBytes(sizes.totalBytes)} exceeds ${formatBytes(limits.totalPackageBytes)}`,
    actual: sizes.totalBytes,
    limit: limits.totalPackageBytes,
  });

  return checks;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
