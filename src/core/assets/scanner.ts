import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

export type AssetType = 'texture' | 'prefab' | 'audio' | 'script' | 'scene' | 'other';

const TYPE_EXT: Record<AssetType, RegExp> = {
  texture: /\.(png|jpg|jpeg|webp|astc|pkm)$/i,
  prefab: /\.prefab$/i,
  audio: /\.(mp3|ogg|wav|m4a)$/i,
  script: /\.(ts|js)$/i,
  scene: /\.scene$/i,
  other: /^$/,
};

export interface AssetEntry {
  path: string;
  type: AssetType;
  bytes: number;
}

export function classifyAsset(filePath: string): AssetType {
  for (const [type, re] of Object.entries(TYPE_EXT) as [AssetType, RegExp][]) {
    if (type === 'other') continue;
    if (re.test(filePath)) return type;
  }
  return 'other';
}

export function listAssets(
  projectRoot: string,
  filterType?: AssetType,
): AssetEntry[] {
  const assetsDir = join(projectRoot, 'assets');
  if (!existsSync(assetsDir)) return [];

  const out: AssetEntry[] = [];

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.meta')) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(projectRoot, full).replace(/\\/g, '/');
      const type = classifyAsset(rel);
      if (filterType && type !== filterType) continue;
      out.push({ path: rel, type, bytes: st.size });
    }
  }

  walk(assetsDir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function analyzeAssets(projectRoot: string) {
  const assets = listAssets(projectRoot);
  const byType: Record<string, { count: number; bytes: number }> = {};
  for (const a of assets) {
    byType[a.type] = byType[a.type] ?? { count: 0, bytes: 0 };
    byType[a.type].count++;
    byType[a.type].bytes += a.bytes;
  }
  const largest = [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 15);
  return { total: assets.length, byType, largest };
}

export function findUnusedAssets(projectRoot: string): AssetEntry[] {
  const assets = listAssets(projectRoot).filter(
    (a) => a.type !== 'script' && a.type !== 'scene' && !a.path.endsWith('.meta'),
  );

  const refs = new Set<string>();
  const assetsDir = join(projectRoot, 'assets');

  function collectRefsFromFile(file: string) {
    try {
      const content = readFileSync(file, 'utf8');
      for (const a of assets) {
        const base = basename(a.path);
        const stem = base.replace(extname(base), '');
        if (content.includes(base) || content.includes(stem)) refs.add(a.path);
      }
    } catch {
      /* skip binary */
    }
  }

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(scene|prefab|ts|js|json)$/i.test(name)) collectRefsFromFile(full);
    }
  }

  if (existsSync(assetsDir)) walk(assetsDir);

  return assets.filter((a) => !refs.has(a.path));
}

export function importAsset(
  projectRoot: string,
  sourcePath: string,
  destRelative: string,
): string {
  const dest = join(projectRoot, destRelative);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(sourcePath, dest);
  return destRelative;
}
