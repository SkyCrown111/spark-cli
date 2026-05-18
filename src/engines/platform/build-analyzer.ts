import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PackageSizeReport } from '../../core/validate/platform-rules.js';
import { getPlatform } from '../../platforms/registry.js';
import type { PlatformId } from '../../core/validate/platform-rules.js';

function dirSize(dir: string, excludePrefixes: string[] = []): { bytes: number; fileCount: number } {
  let bytes = 0;
  let fileCount = 0;

  function walk(current: string) {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const rel = relative(dir, full).replace(/\\/g, '/');
      if (excludePrefixes.some((p) => rel === p || rel.startsWith(p))) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        bytes += st.size;
        fileCount++;
      }
    }
  }

  walk(dir);
  return { bytes, fileCount };
}

export function findPlatformBuildDir(projectRoot: string, platform: PlatformId): string | null {
  const def = getPlatform(platform);
  if (!def) return null;
  const base = join(projectRoot, 'build');
  if (!existsSync(base)) return null;
  for (const name of def.buildDirNames) {
    const dir = join(base, name);
    if (existsSync(dir) && statSync(dir).isDirectory()) return dir;
  }
  return null;
}

interface GameJson {
  subpackages?: { name: string; root: string }[];
}

export function analyzePlatformBuild(
  projectRoot: string,
  platform: PlatformId,
): PackageSizeReport {
  const buildDir = findPlatformBuildDir(projectRoot, platform);
  if (!buildDir) {
    const def = getPlatform(platform)!;
    throw new Error(
      `No ${def.label} build output under build/. Build with Cocos (platform: ${platform}) first.`,
    );
  }

  const gameJsonPath = join(buildDir, 'game.json');
  let subpackageRoots: { name: string; root: string }[] = [];
  if (existsSync(gameJsonPath)) {
    try {
      const game = JSON.parse(readFileSync(gameJsonPath, 'utf8')) as GameJson;
      subpackageRoots = (game.subpackages ?? []).map((s) => ({
        name: s.name,
        root: s.root.replace(/\\/g, '/').replace(/\/$/, ''),
      }));
    } catch {
      /* ignore */
    }
  }

  const subpackages: PackageSizeReport['subpackages'] = [];
  let subBytesTotal = 0;
  let subFileCount = 0;

  for (const sub of subpackageRoots) {
    const subDir = join(buildDir, sub.root);
    if (!existsSync(subDir)) continue;
    const { bytes, fileCount } = dirSize(subDir);
    subpackages.push({ name: sub.name, root: sub.root, bytes });
    subBytesTotal += bytes;
    subFileCount += fileCount;
  }

  const exclude = subpackageRoots.map((s) => s.root);
  const main = dirSize(buildDir, exclude);

  return {
    buildDir,
    mainBytes: main.bytes,
    subpackages,
    totalBytes: main.bytes + subBytesTotal,
    fileCount: main.fileCount + subFileCount,
  };
}
