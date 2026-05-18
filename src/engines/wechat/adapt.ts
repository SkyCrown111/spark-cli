import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeWechatBuild,
  findWechatBuildDir,
} from './build-analyzer.js';
import {
  compareToLimits,
  formatBytes,
  loadWechatRules,
  type LimitCheck,
} from '../../core/validate/wechat-limits.js';
import { parseCocosScene } from '../cocos/scene-parser.js';
import { findSceneFiles } from '../cocos/scene-list.js';
import { suggestWechatSplits } from './suggest-split.js';

export interface AdaptIssue {
  id: string;
  severity: 'error' | 'warn' | 'info';
  category: 'package' | 'assets' | 'scene' | 'config';
  message: string;
  fixable?: boolean;
}

export interface AdaptReport {
  ok: boolean;
  buildFound: boolean;
  sizes?: ReturnType<typeof analyzeWechatBuild>;
  limitChecks?: LimitCheck[];
  issues: AdaptIssue[];
  suggestions?: ReturnType<typeof suggestWechatSplits>;
}

export function runWechatAdapt(projectRoot: string): AdaptReport {
  const rules = loadWechatRules(projectRoot);
  const issues: AdaptIssue[] = [];
  let sizes;
  let limitChecks: LimitCheck[] | undefined;
  const buildFound = Boolean(findWechatBuildDir(projectRoot));

  if (buildFound) {
    sizes = analyzeWechatBuild(projectRoot);
    limitChecks = compareToLimits(sizes, rules);
    for (const c of limitChecks) {
      if (c.ok && c.severity === 'info') continue;
      issues.push({
        id: c.id,
        severity: c.severity === 'error' ? 'error' : 'warn',
        category: 'package',
        message: c.message,
        fixable: c.id === 'main_package' && !c.ok,
      });
    }
  } else {
    issues.push({
      id: 'no_build',
      severity: 'warn',
      category: 'package',
      message: 'No build/wechatgame output — run `spark-cli build wechat` for package size checks',
    });
  }

  const textureWarn = rules.thresholds?.textureWarnBytes ?? 512 * 1024;
  for (const large of findLargeTextures(projectRoot, textureWarn)) {
    issues.push({
      id: `large_texture_${large.path}`,
      severity: 'warn',
      category: 'assets',
      message: `Large texture ${large.path} (${formatBytes(large.bytes)}) — enable compression`,
      fixable: false,
    });
  }

  const scenes = findSceneFiles(projectRoot);
  for (const scene of scenes.slice(0, 3)) {
    try {
      const analysis = parseCocosScene(join(projectRoot, scene));
      if (analysis.nodeCount > 80) {
        issues.push({
          id: `scene_nodes_${scene}`,
          severity: 'warn',
          category: 'scene',
          message: `${scene} has ${analysis.nodeCount} nodes — simplify first screen`,
        });
      }
    } catch {
      /* skip */
    }
  }

  const ok = !issues.some((i) => i.severity === 'error');

  return {
    ok,
    buildFound,
    sizes,
    limitChecks,
    issues,
    suggestions: !ok || issues.some((i) => i.category === 'package') ? suggestWechatSplits(projectRoot) : undefined,
  };
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

export interface AdaptFixResult {
  applied: string[];
  reportPath: string;
}

/** Safe fixes: write adapt report + optional game.json snippet to .spark-cli/ */
export function applyWechatAdaptFixes(
  projectRoot: string,
  report: AdaptReport,
): AdaptFixResult {
  const sparkDir = join(projectRoot, '.spark-cli');
  mkdirSync(sparkDir, { recursive: true });

  const reportPath = join(sparkDir, 'wechat-adapt-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  const applied = [`Wrote ${reportPath}`];

  if (report.suggestions?.length) {
    const snippetPath = join(sparkDir, 'wechat-subpackages-suggested.json');
    const subpackages = report.suggestions.map((s) => ({
      name: s.name,
      root: s.root,
    }));
    writeFileSync(
      snippetPath,
      JSON.stringify({ subpackages }, null, 2) + '\n',
      'utf8',
    );
    applied.push(`Wrote subpackage snippet ${snippetPath}`);
  }

  return { applied, reportPath };
}
