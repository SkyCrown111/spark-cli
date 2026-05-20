/**
 * Phase 14 #5 — Assets audit + fix.
 *
 * Image dimensions: optional `sharp` (PNG/JPEG/WebP) when installed, else header sniff:
 *   - PNG: width/height at offset 16 (big-endian uint32 each).
 *   - JPG: walk SOFx markers.
 *   - WAV: RIFF header at offset 0; sample rate at byte 24 (LE uint32),
 *     channels at byte 22 (LE uint16), bitsPerSample at 34, data size at 40.
 *   - OGG/MP3 are flagged by extension only (no deep parse) — they trigger size
 *     rules but not sample-rate rules.
 *
 * `auditAssets()` is pure: takes a project root, returns issues. `applyFix()`
 * accepts a single issue and stages a fix when the rule supports it (right
 * now: `unused` → soft-delete-stage, `oversize-png` → no-op suggestion).
 */

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { stageDeleteFile } from '../staging/patch-manager.js';
import { findUnusedAssets } from './scanner.js';
import { readImageDimensions } from './image-dims.js';

export type AuditSeverity = 'error' | 'warn' | 'hint';

export interface AuditIssue {
  rule: string;
  severity: AuditSeverity;
  /** Project-relative path with forward slashes. */
  path: string;
  message: string;
  suggestion?: string;
  /** Loosely-typed payload, e.g. width/height/sampleRate. */
  details?: Record<string, unknown>;
}

export interface AuditOptions {
  /** Directory under projectRoot to scan; defaults to 'assets'. */
  dir?: string;
  /** Skip very expensive walks if the asset directory is larger than this many files. */
  maxFiles?: number;
  /** Disable specific rule ids. */
  disable?: string[];
}

export async function auditAssets(
  projectRoot: string,
  opts: AuditOptions = {},
): Promise<AuditIssue[]> {
  const dir = opts.dir ?? 'assets';
  const root = join(projectRoot, dir);
  if (!existsSync(root)) return [];
  const files: string[] = [];
  walk(root, files);
  if (opts.maxFiles && files.length > opts.maxFiles) {
    return [
      {
        rule: 'audit-aborted',
        severity: 'hint',
        path: dir,
        message: `${files.length} files > maxFiles=${opts.maxFiles}; refine --dir`,
      },
    ];
  }

  const disabled = new Set(opts.disable ?? []);
  const issues: AuditIssue[] = [];
  for (const full of files) {
    const rel = relative(projectRoot, full).replace(/\\/g, '/');
    const ext = extname(rel).toLowerCase();
    const size = safeStatSize(full);

    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      const dims = await readImageDimensions(full, ext);
      if (dims) {
        if (!disabled.has('texture-oversize') && (dims.width > 2048 || dims.height > 2048)) {
          issues.push({
            rule: 'texture-oversize',
            severity: 'warn',
            path: rel,
            message: `Image is ${dims.width}x${dims.height}; minigames typically cap at 2048`,
            suggestion: 'Resize or split atlas',
            details: { width: dims.width, height: dims.height, bytes: size },
          });
        }
        if (
          !disabled.has('texture-non-pow2') &&
          (!isPowerOfTwo(dims.width) || !isPowerOfTwo(dims.height))
        ) {
          issues.push({
            rule: 'texture-non-pow2',
            severity: 'hint',
            path: rel,
            message: `Image dimensions ${dims.width}x${dims.height} are not power-of-two`,
            suggestion: 'Pad or rescale for GPU mipmap efficiency',
            details: { width: dims.width, height: dims.height },
          });
        }
      }
      if (
        !disabled.has('texture-uncompressed') &&
        ext === '.png' &&
        size > 512 * 1024 // 512 KB threshold for raw PNG
      ) {
        issues.push({
          rule: 'texture-uncompressed',
          severity: 'hint',
          path: rel,
          message: `PNG is ${formatKB(size)}; consider compressing (pngcrush / zstd-png) or converting to WebP`,
          details: { bytes: size },
        });
      }
    }

    if (ext === '.wav' && !disabled.has('audio-samplerate')) {
      const wav = readWavMeta(full);
      if (wav && wav.sampleRate > 44100) {
        issues.push({
          rule: 'audio-samplerate',
          severity: 'warn',
          path: rel,
          message: `WAV sample rate is ${wav.sampleRate}Hz; downsample to 44100 for mobile`,
          details: { sampleRate: wav.sampleRate, channels: wav.channels, bytes: size },
        });
      }
    }
    if (
      !disabled.has('audio-oversize') &&
      (ext === '.wav' || ext === '.mp3' || ext === '.ogg' || ext === '.m4a') &&
      size > 1024 * 1024
    ) {
      issues.push({
        rule: 'audio-oversize',
        severity: 'hint',
        path: rel,
        message: `Audio file is ${formatKB(size)}; consider streaming or splitting`,
        details: { bytes: size },
      });
    }
  }

  if (!disabled.has('asset-unused')) {
    for (const a of findUnusedAssets(projectRoot)) {
      issues.push({
        rule: 'asset-unused',
        severity: 'hint',
        path: a.path,
        message: `Asset has no detected references in scenes/scripts`,
        suggestion: 'Verify and remove with `spark-cli asset fix --rule asset-unused`',
        details: { bytes: a.bytes, type: a.type },
      });
    }
  }

  // Stable ordering: rule, then path.
  issues.sort((x, y) => x.rule.localeCompare(y.rule) || x.path.localeCompare(y.path));
  return issues;
}

export interface FixResult {
  rule: string;
  path: string;
  applied: boolean;
  staged: boolean;
  message: string;
}

/**
 * Apply a fix for a single issue. Today only `asset-unused` is auto-fixable
 * and stages a real delete-op for review/apply.
 */
export function applyFix(
  projectRoot: string,
  issue: AuditIssue,
  opts: { apply: boolean } = { apply: false },
): FixResult {
  if (issue.rule === 'asset-unused') {
    if (!opts.apply) {
      return {
        rule: issue.rule,
        path: issue.path,
        applied: false,
        staged: false,
        message: `Would delete unused asset ${issue.path} (run with --apply to stage)`,
      };
    }
    stageDeleteFile(projectRoot, issue.path);
    return {
      rule: issue.rule,
      path: issue.path,
      applied: true,
      staged: true,
      message: `Staged delete for ${issue.path}`,
    };
  }
  return {
    rule: issue.rule,
    path: issue.path,
    applied: false,
    staged: false,
    message: `No automatic fix available for rule ${issue.rule}`,
  };
}

/**
 * Test-only helper: deletes a file under projectRoot. Not used by CLI fix path
 * (we go via staging there) but kept for unit tests that want to mutate the
 * fixture without the staging layer.
 */
export function _hardDeleteAsset(projectRoot: string, rel: string): void {
  const full = join(projectRoot, rel);
  if (existsSync(full)) unlinkSync(full);
}

// ---------- helpers --------------------------------------------------------

function walk(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.endsWith('.meta')) continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function safeStatSize(full: string): number {
  try {
    return statSync(full).size;
  } catch {
    return 0;
  }
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

interface WavMeta {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

function readWavMeta(full: string): WavMeta | null {
  let buf: Buffer;
  try {
    buf = readFileSync(full);
  } catch {
    return null;
  }
  if (buf.length < 44) return null;
  if (
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE' ||
    buf.toString('ascii', 12, 16) !== 'fmt '
  ) {
    return null;
  }
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  return { channels, sampleRate, bitsPerSample };
}
