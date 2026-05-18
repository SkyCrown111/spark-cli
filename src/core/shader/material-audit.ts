/**
 * Scan material / shader keyword usage for overdraw risks.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface MaterialAuditFinding {
  path: string;
  rule: string;
  severity: 'warn' | 'info';
  message: string;
}

const MAT_PATTERNS = [/\.mat$/i, /\.mtl$/i, /\.material$/i, /effect.*\.json$/i];

function walkMaterials(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) walkMaterials(full, out);
    else if (MAT_PATTERNS.some((p) => p.test(name))) out.push(full);
  }
}

export function auditMaterials(projectRoot: string): MaterialAuditFinding[] {
  const findings: MaterialAuditFinding[] = [];
  const files: string[] = [];
  walkMaterials(join(projectRoot, 'assets'), files);
  walkMaterials(join(projectRoot, 'Assets'), files);

  const keywordMap = new Map<string, string[]>();

  for (const abs of files) {
    const rel = abs.replace(projectRoot, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
    const text = readFileSync(abs, 'utf8');
    const keywords = [...text.matchAll(/(?:m_Keywords|keywords|shaderKeywords)\s*[:=]\s*\[([^\]]*)\]/gi)];
    for (const k of keywords) {
      const raw = k[1] ?? '';
      for (const kw of raw.split(/[,|]/).map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)) {
        const list = keywordMap.get(kw) ?? [];
        list.push(rel);
        keywordMap.set(kw, list);
      }
    }

    const passes = (text.match(/m_PassCount|"passes"\s*:\s*\[/gi) ?? []).length;
    if (passes > 2 || /"passes"\s*:\s*\[[\s\S]*?,[\s\S]*?,[\s\S]*?,/.test(text)) {
      findings.push({
        path: rel,
        rule: 'multi-pass',
        severity: 'warn',
        message: 'Material may use >2 passes — check overdraw',
      });
    }
  }

  for (const [kw, paths] of keywordMap) {
    if (paths.length > 8) {
      findings.push({
        path: paths[0]!,
        rule: 'keyword-overuse',
        severity: 'warn',
        message: `Keyword "${kw}" appears in ${paths.length} materials`,
      });
    }
  }

  return findings;
}
