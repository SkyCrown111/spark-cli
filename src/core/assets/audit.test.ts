import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditAssets, applyFix } from './audit.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gcli-assets-audit-'));
  mkdirSync(join(tmp, 'assets', 'textures'), { recursive: true });
  mkdirSync(join(tmp, 'assets', 'audio'), { recursive: true });
  mkdirSync(join(tmp, 'assets', 'scenes'), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Build a minimal PNG with the given dimensions (no IDAT body — just enough for the dim probe). */
function makePng(width: number, height: number, padBytes = 0): Buffer {
  // 8-byte signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR chunk: 4-byte length(=13), "IHDR", 4-byte width, 4-byte height, 5 bytes (depth/color/etc), 4-byte CRC
  const ihdrBody = Buffer.alloc(13);
  ihdrBody.writeUInt32BE(width, 0);
  ihdrBody.writeUInt32BE(height, 4);
  // The remaining 5 bytes (depth/colorType/compression/filter/interlace) can be zeros for the probe.
  const ihdr = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    ihdrBody,
    Buffer.from([0, 0, 0, 0]), // CRC placeholder
  ]);
  const pad = Buffer.alloc(padBytes, 0);
  return Buffer.concat([sig, ihdr, pad]);
}

/** Build a minimal WAV header with the given sample rate. */
function makeWav(sampleRate: number, dataBytes = 16): Buffer {
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); // byte rate
  buf.writeUInt16LE(4, 32); // block align
  buf.writeUInt16LE(16, 34); // bitsPerSample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe('auditAssets', () => {
  it('returns [] when assets/ does not exist', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'gcli-assets-empty-'));
    try {
      expect(await auditAssets(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('flags an oversize PNG (>2048)', async () => {
    writeFileSync(join(tmp, 'assets/textures/big.png'), makePng(4096, 2048));
    const issues = await auditAssets(tmp, { disable: ['asset-unused', 'texture-uncompressed'] });
    const hit = issues.find((i) => i.rule === 'texture-oversize');
    expect(hit).toBeDefined();
    expect(hit!.details?.width).toBe(4096);
  });

  it('flags non-power-of-two dimensions', async () => {
    writeFileSync(join(tmp, 'assets/textures/odd.png'), makePng(300, 500));
    const issues = await auditAssets(tmp, { disable: ['asset-unused', 'texture-uncompressed'] });
    expect(issues.find((i) => i.rule === 'texture-non-pow2')).toBeDefined();
  });

  it('does NOT flag a 256x256 png as non-pow2 nor oversize', async () => {
    writeFileSync(join(tmp, 'assets/textures/ok.png'), makePng(256, 256));
    const issues = await auditAssets(tmp, { disable: ['asset-unused', 'texture-uncompressed'] });
    expect(issues.find((i) => i.rule === 'texture-oversize')).toBeUndefined();
    expect(issues.find((i) => i.rule === 'texture-non-pow2')).toBeUndefined();
  });

  it('flags a high-sample-rate WAV', async () => {
    writeFileSync(join(tmp, 'assets/audio/loud.wav'), makeWav(48000));
    const issues = await auditAssets(tmp, { disable: ['asset-unused'] });
    const hit = issues.find((i) => i.rule === 'audio-samplerate');
    expect(hit).toBeDefined();
    expect(hit!.details?.sampleRate).toBe(48000);
  });

  it('respects the disable option', async () => {
    writeFileSync(join(tmp, 'assets/textures/big.png'), makePng(4096, 4096));
    const issues = await auditAssets(tmp, {
      disable: ['texture-oversize', 'asset-unused', 'texture-uncompressed'],
    });
    expect(issues.find((i) => i.rule === 'texture-oversize')).toBeUndefined();
  });

  it('lists unused assets when nothing references them', async () => {
    writeFileSync(join(tmp, 'assets/textures/orphan.png'), makePng(64, 64));
    const issues = await auditAssets(tmp);
    expect(issues.find((i) => i.rule === 'asset-unused' && i.path.endsWith('orphan.png'))).toBeDefined();
  });
});

describe('applyFix', () => {
  it('reports a dry-run plan for asset-unused without --apply', async () => {
    writeFileSync(join(tmp, 'assets/textures/orphan.png'), makePng(64, 64));
    const issues = await auditAssets(tmp);
    const issue = issues.find((i) => i.rule === 'asset-unused')!;
    const r = applyFix(tmp, issue, { apply: false });
    expect(r.applied).toBe(false);
    expect(r.staged).toBe(false);
    expect(r.message).toMatch(/Would delete/);
  });

  it('stages a tombstone with --apply', async () => {
    writeFileSync(join(tmp, 'assets/textures/orphan.png'), makePng(64, 64));
    const issues = await auditAssets(tmp);
    const issue = issues.find((i) => i.rule === 'asset-unused')!;
    const r = applyFix(tmp, issue, { apply: true });
    expect(r.staged).toBe(true);
    const tombstone = join(tmp, '.spark-cli/staging/files', `${issue.path}.spark-cli-deleted`);
    expect(existsSync(tombstone)).toBe(true);
    expect(readFileSync(tombstone, 'utf8')).toMatch(/Tombstone/);
  });

  it('reports no-fix for rules without an automatic remediation', () => {
    const issue = {
      rule: 'texture-oversize',
      severity: 'warn' as const,
      path: 'assets/x.png',
      message: 'foo',
    };
    const r = applyFix(tmp, issue, { apply: true });
    expect(r.applied).toBe(false);
    expect(r.message).toMatch(/No automatic fix/);
  });
});
