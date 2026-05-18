import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translateShader } from './translate.js';

describe('shader translate', () => {
  it('translates HLSL fixture toward GLSL', () => {
    const src = readFileSync(join(process.cwd(), 'fixtures/shaders/test.hlsl'), 'utf8');
    const r = translateShader(src, 'glsl', 'test.hlsl');
    expect(r.output).toContain('texture(');
    expect(r.unsafe).toBe(true);
  });
});
