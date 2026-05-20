import { describe, it, expect } from 'vitest';
import { probeOptionalRequire, tryImportOptional } from './optional-module.js';

describe('optional-module', () => {
  it('probeOptionalRequire reports missing packages', () => {
    const r = probeOptionalRequire('__spark_cli_nonexistent_pkg_xyz__');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not installed/);
  });

  it('tryImportOptional reports missing packages', async () => {
    const r = await tryImportOptional('__spark_cli_nonexistent_pkg_xyz__');
    expect(r.ok).toBe(false);
  });
});
