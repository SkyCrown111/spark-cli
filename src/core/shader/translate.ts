/**
 * Best-effort shader translation (rule-based; marks unsafe when naga unavailable).
 */

export type ShaderTarget = 'hlsl' | 'glsl' | 'metal' | 'wgsl';

export interface ShaderTranslateResult {
  target: ShaderTarget;
  source: string;
  output: string;
  unsafe: boolean;
  notes: string[];
}

export function translateShader(
  source: string,
  target: ShaderTarget,
  sourcePath = 'shader',
): ShaderTranslateResult {
  const notes: string[] = [];
  let out = source;
  let unsafe = false;
  const fromHlsl = /\.(hlsl|shader|cginc)$/i.test(sourcePath) || /\bfloat4\b/.test(source);
  const fromGlsl = /\.(glsl|frag|vert|usl)$/i.test(sourcePath) || /\bvec4\b/.test(source);

  if (target === 'glsl' && fromHlsl) {
    out = out
      .replace(/\bfloat4\b/g, 'vec4')
      .replace(/\bfloat3\b/g, 'vec3')
      .replace(/\bfloat2\b/g, 'vec2')
      .replace(/\bfloat\b/g, 'float')
      .replace(/\btex2D\s*\(/g, 'texture(')
      .replace(/\bmul\s*\(/g, '(')
      .replace(/\bSV_Target\b/g, 'fragColor');
    if (!/precision\s+mediump\s+float/.test(out)) {
      out = 'precision mediump float;\n' + out;
    }
    notes.push('Rule-based HLSL→GLSL — verify in target engine');
    unsafe = true;
  } else if (target === 'hlsl' && fromGlsl) {
    out = out
      .replace(/\bvec4\b/g, 'float4')
      .replace(/\bvec3\b/g, 'float3')
      .replace(/\bvec2\b/g, 'float2')
      .replace(/\btexture\s*\(/g, 'tex2D(')
      .replace(/\bgl_FragColor\b/g, 'SV_Target');
    notes.push('Rule-based GLSL→HLSL — verify in Unity/UE');
    unsafe = true;
  } else if (target === 'wgsl') {
    out = `// WGSL stub from ${sourcePath}\n// Install naga for production translation\n` + out.slice(0, 500);
    notes.push('WGSL translation requires optional naga — output is placeholder');
    unsafe = true;
  } else if (target === 'metal') {
    out = `// Metal stub from ${sourcePath}\n` + out.slice(0, 500);
    notes.push('Metal translation is best-effort only');
    unsafe = true;
  } else {
    notes.push('No transform applied (already compatible or unknown dialect)');
  }

  return { target, source, output: out, unsafe, notes };
}
