import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseSketchJson, sketchToDesignSummary } from './sketch-import.js';

describe('sketch-import', () => {
  it('parses fixture and summarizes layers', () => {
    const path = join(process.cwd(), 'fixtures/ui-input/login-screen.sketch.json');
    const doc = parseSketchJson(path);
    const summary = sketchToDesignSummary(doc);
    expect(summary).toContain('LoginScreen');
    expect(summary).toContain('LoginButton');
  });
});
