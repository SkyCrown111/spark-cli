/**
 * Shader lint — GLSL / HLSL / Cocos USL heuristics (no external compiler).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface ShaderLintFinding {
  rule: string;
  severity: 'warn' | 'error';
  path: string;
  line?: number;
  message: string;
}

const SHADER_EXT = new Set([
  '.shader',
  '.glsl',
  '.hlsl',
  '.cginc',
  '.usl',
  '.frag',
  '.vert',
  '.metal',
]);

function walkShaders(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walkShaders(full, out);
    } else if (SHADER_EXT.has(extname(name).toLowerCase())) {
      out.push(full);
    }
  }
}

export function lintShaderSource(relPath: string, source: string): ShaderLintFinding[] {
  const findings: ShaderLintFinding[] = [];
  const lower = source.toLowerCase();
  const isGlsl = /\.(glsl|frag|vert|usl)$/i.test(relPath) || lower.includes('gl_es');
  const isHlsl = /\.(hlsl|shader|cginc)$/i.test(relPath) || lower.includes('sampler2d');

  if (isGlsl && /\bgl_fragcolor\b/i.test(source)) {
    findings.push({
      rule: 'glsl-es-deprecated',
      severity: 'warn',
      path: relPath,
      message: 'gl_FragColor is deprecated in GLSL ES 3.0 — use out vec4 fragColor',
    });
  }

  if (isGlsl && !/precision\s+(lowp|mediump|highp)\s+float/i.test(source)) {
    findings.push({
      rule: 'missing-precision',
      severity: 'warn',
      path: relPath,
      message: 'Missing default float precision qualifier for mobile GLSL',
    });
  }

  if (isHlsl && /\btex2D\s*\(/.test(source) && isGlsl) {
    findings.push({
      rule: 'hlsl-in-glsl',
      severity: 'error',
      path: relPath,
      message: 'tex2D() is HLSL/D3D — use texture() in GLSL',
    });
  }

  if (/\bsampler2D\b/.test(source) && /\btexture\s*\(/.test(source) && isHlsl) {
    findings.push({
      rule: 'glsl-in-hlsl',
      severity: 'warn',
      path: relPath,
      message: 'Mixing GLSL texture() with HLSL-style file extension',
    });
  }

  if (/#pragma\s+multi_compile/i.test(source)) {
    const keywords = source.match(/#pragma\s+multi_compile[^\n]*/gi) ?? [];
    if (keywords.length > 4) {
      findings.push({
        rule: 'shader-variants',
        severity: 'warn',
        path: relPath,
        message: `${keywords.length} multi_compile pragmas — variant explosion risk`,
      });
    }
  }

  if (/#if\s+CC_PLATFORM/i.test(source) || /COCOS/i.test(source)) {
    if (!/#if|#elif|#endif/.test(source)) {
      findings.push({
        rule: 'usl-platform-tag',
        severity: 'warn',
        path: relPath,
        message: 'Cocos USL platform macros present — verify target platform branches',
      });
    }
  }

  return findings;
}

export function lintShadersInProject(
  projectRoot: string,
  opts: { dirs?: string[] } = {},
): ShaderLintFinding[] {
  const dirs = opts.dirs ?? ['assets', 'Shaders', 'shaders'];
  const files: string[] = [];
  for (const d of dirs) walkShaders(join(projectRoot, d), files);

  const all: ShaderLintFinding[] = [];
  for (const abs of files) {
    const rel = abs.replace(projectRoot, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
    all.push(...lintShaderSource(rel, readFileSync(abs, 'utf8')));
  }
  return all;
}
