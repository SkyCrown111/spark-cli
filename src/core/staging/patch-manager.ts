import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { getProjectSparkDir, getStagingDir } from '../../config/paths.js';
import { SparkCLIError } from '../../utils/errors.js';
import { runHooks } from '../hooks/runner.js';

export interface StagedFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
  kind?: 'text' | 'binary';
  sizeBytes?: number;
}

export interface StagingManifest {
  id: string;
  createdAt: string;
  files: StagedFile[];
}

function manifestPath(projectRoot: string): string {
  return join(getStagingDir(projectRoot), 'manifest.json');
}

function stagingRoot(projectRoot: string): string {
  return getStagingDir(projectRoot);
}

function stagedFilesRoot(projectRoot: string): string {
  return join(stagingRoot(projectRoot), 'files');
}

function stagedFilePath(projectRoot: string, relativePath: string): string {
  return join(stagedFilesRoot(projectRoot), relativePath);
}

function inferFileKindFromPath(relativePath: string): 'text' | 'binary' {
  const ext = extname(relativePath).toLowerCase();
  return new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.ico',
    '.wav',
    '.mp3',
    '.ogg',
    '.m4a',
    '.aac',
    '.flac',
    '.ttf',
    '.otf',
    '.woff',
    '.woff2',
    '.zip',
    '.gz',
    '.7z',
    '.rar',
    '.pdf',
    '.mp4',
    '.mov',
    '.avi',
    '.webm',
  ]).has(ext)
    ? 'binary'
    : 'text';
}

function validateStagedRelativePath(projectRoot: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new SparkCLIError('Staged path must be a non-empty relative path.', 1);
  }

  const normalized = normalize(relativePath.replace(/\\/g, '/')).replace(/\\/g, '/');
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.startsWith('/') ||
    isAbsolute(normalized)
  ) {
    throw new SparkCLIError(`Staged path escapes the project root: ${relativePath}`, 1);
  }
  if (
    normalized === '.spark' ||
    normalized.startsWith('.spark/') ||
    normalized === '.spark-cli' ||
    normalized.startsWith('.spark-cli/')
  ) {
    throw new SparkCLIError(`Refusing to stage internal Spark path: ${relativePath}`, 1);
  }

  const projectAbs = resolve(projectRoot);
  const targetAbs = resolve(projectRoot, normalized);
  const rel = relative(projectAbs, targetAbs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new SparkCLIError(`Staged path escapes the project root: ${relativePath}`, 1);
  }

  return normalized;
}

export function hasStaging(projectRoot: string): boolean {
  return existsSync(manifestPath(projectRoot));
}

export function loadManifest(projectRoot: string): StagingManifest {
  const raw = readFileSync(manifestPath(projectRoot), 'utf8');
  return JSON.parse(raw) as StagingManifest;
}

export function clearStaging(projectRoot: string): void {
  const dir = stagingRoot(projectRoot);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function initStaging(projectRoot: string): StagingManifest {
  clearStaging(projectRoot);
  const dir = stagingRoot(projectRoot);
  mkdirSync(dir, { recursive: true });
  const manifest: StagingManifest = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    files: [],
  };
  writeFileSync(manifestPath(projectRoot), JSON.stringify(manifest, null, 2));
  return manifest;
}

function ensureManifest(projectRoot: string): StagingManifest {
  const sparkDir = getProjectSparkDir(projectRoot);
  if (!existsSync(join(sparkDir, 'staging', 'manifest.json'))) {
    return initStaging(projectRoot);
  }
  return loadManifest(projectRoot);
}

function saveManifest(projectRoot: string, manifest: StagingManifest): void {
  writeFileSync(manifestPath(projectRoot), JSON.stringify(manifest, null, 2));
}

function upsertManifestFile(projectRoot: string, entry: StagedFile): void {
  const manifest = ensureManifest(projectRoot);
  const existing = manifest.files.findIndex((file) => file.path === entry.path);
  if (existing >= 0) manifest.files[existing] = entry;
  else manifest.files.push(entry);
  saveManifest(projectRoot, manifest);
}

export function stageWriteFile(projectRoot: string, relativePath: string, content: string): void {
  const safePath = validateStagedRelativePath(projectRoot, relativePath);
  ensureManifest(projectRoot);
  const target = join(projectRoot, safePath);
  const staged = stagedFilePath(projectRoot, safePath);
  const action: StagedFile['action'] = existsSync(target) ? 'modify' : 'create';

  mkdirSync(dirname(staged), { recursive: true });
  writeFileSync(staged, content, 'utf8');
  upsertManifestFile(projectRoot, {
    path: safePath,
    action,
    kind: 'text',
    sizeBytes: Buffer.byteLength(content, 'utf8'),
  });
}

/** Stage binary content (audio, images) without UTF-8 coercion. */
export function stageWriteBuffer(projectRoot: string, relativePath: string, content: Buffer): void {
  const safePath = validateStagedRelativePath(projectRoot, relativePath);
  ensureManifest(projectRoot);
  const target = join(projectRoot, safePath);
  const staged = stagedFilePath(projectRoot, safePath);
  const action: StagedFile['action'] = existsSync(target) ? 'modify' : 'create';

  mkdirSync(dirname(staged), { recursive: true });
  writeFileSync(staged, content);
  upsertManifestFile(projectRoot, {
    path: safePath,
    action,
    kind: 'binary',
    sizeBytes: content.byteLength,
  });
}

export function stageDeleteFile(projectRoot: string, relativePath: string): void {
  const safePath = validateStagedRelativePath(projectRoot, relativePath);
  ensureManifest(projectRoot);
  const target = join(projectRoot, safePath);
  if (!existsSync(target)) {
    throw new SparkCLIError(`Cannot stage delete for missing file: ${safePath}`, 1);
  }
  const staged = stagedFilePath(projectRoot, safePath);
  if (existsSync(staged)) {
    rmSync(staged, { force: true });
  }
  upsertManifestFile(projectRoot, {
    path: safePath,
    action: 'delete',
    kind: inferFileKindFromPath(safePath),
    sizeBytes: statSync(target).size,
  });
}

export function showDiff(projectRoot: string): string {
  if (!hasStaging(projectRoot)) {
    return '';
  }
  const manifest = loadManifest(projectRoot);
  const parts: string[] = [];
  for (const file of manifest.files) {
    const staged = stagedFilePath(projectRoot, file.path);
    const target = join(projectRoot, file.path);
    if (file.action === 'delete') {
      if (!existsSync(target)) {
        parts.push(`Delete skipped for missing file ${file.path}\n`);
        continue;
      }
      if (file.kind === 'binary') {
        const removedBytes = statSync(target).size;
        parts.push(`Binary file ${file.path}\n--- existing (${removedBytes} bytes)\n+++ deleted\n`);
        continue;
      }
      const oldContent = readFileSync(target, 'utf8');
      const patch = createTwoFilesPatch(file.path, `${file.path} (deleted)`, oldContent, '');
      parts.push(patch);
      continue;
    }
    if (file.kind === 'binary') {
      const oldLabel = existsSync(target) ? 'binary file exists' : 'new binary file';
      const stagedBytes = existsSync(staged) ? statSync(staged).size : 0;
      parts.push(`Binary file ${file.path}\n--- ${oldLabel}\n+++ staged (${stagedBytes} bytes)\n`);
      continue;
    }
    const oldContent = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const newContent = existsSync(staged) ? readFileSync(staged, 'utf8') : '';
    const patch = createTwoFilesPatch(file.path, file.path + ' (staged)', oldContent, newContent);
    parts.push(patch);
  }
  return parts.join('\n');
}

export async function applyStaging(
  projectRoot: string,
  options: { yes?: boolean; backup?: boolean; dryRun?: boolean },
): Promise<string[]> {
  if (!hasStaging(projectRoot)) {
    throw new SparkCLIError('No staged changes. Run a command that writes to staging first.', 1, [
      'Try: spark-cli chat "..."',
    ]);
  }
  const manifest = loadManifest(projectRoot);
  const applied: string[] = [];

  if (options.dryRun) {
    return manifest.files.map((f) => f.path);
  }

  // before_apply hook (blocking).
  const hookResult = runHooks(
    'before_apply',
    {
      event: 'before_apply',
      projectRoot,
      files: manifest.files.map((f) => ({ path: f.path, action: f.action })),
    },
    projectRoot,
  );
  if (hookResult.blocked) {
    throw new SparkCLIError(
      `Apply blocked by before_apply hook: ${hookResult.reason ?? 'no reason given'}`,
      1,
      ['Inspect .spark/hooks/config.json or run with hooks disabled.'],
    );
  }

  for (const file of manifest.files) {
    const staged = stagedFilePath(projectRoot, file.path);
    const target = join(projectRoot, file.path);
    if (options.backup && existsSync(target)) {
      const backupDir = join(getProjectSparkDir(projectRoot), 'backups');
      mkdirSync(backupDir, { recursive: true });
      const stamp = Date.now();
      copyFileSync(target, join(backupDir, `${stamp}-${file.path.replace(/[/\\]/g, '_')}`));
    }
    if (file.action === 'delete') {
      if (existsSync(target)) {
        rmSync(target, { force: true });
      }
    } else {
      mkdirSync(dirname(target), { recursive: true });
      if (file.kind === 'binary') {
        const content = readFileSync(staged);
        writeFileSync(target, content);
      } else {
        const content = readFileSync(staged, 'utf8');
        writeFileSync(target, content, 'utf8');
      }
    }
    applied.push(file.path);
  }

  clearStaging(projectRoot);

  // Auto-commit if configured
  if (applied.length > 0) {
    try {
      // Dynamic import to avoid circular dependency at module load time
      const { autoCommit, generateCommitMessage } = await import('../git/auto-commit.js');
      // We need to check config — use a sync guard since applyStaging is sync
      // The caller can opt into autoCommit via config.git.autoCommit
      // We detect it by checking if the project has the config flag set
      const { loadMergedConfig } = await import('../../config/load.js');
      const config = await loadMergedConfig(projectRoot);
      if (config.git?.autoCommit) {
        const commitMsg = generateCommitMessage(manifest);
        autoCommit(projectRoot, commitMsg);
      }
    } catch {
      // Auto-commit failures are non-critical
    }
  }

  return applied;
}

export function listStagedFiles(projectRoot: string): string[] {
  if (!hasStaging(projectRoot)) return [];
  return loadManifest(projectRoot).files.map((f) => f.path);
}

export function listAllStagedPaths(projectRoot: string): string[] {
  if (!hasStaging(projectRoot)) return [];
  const filesDir = stagedFilesRoot(projectRoot);
  const manifestPaths = new Set(loadManifest(projectRoot).files.map((file) => file.path));
  if (!existsSync(filesDir)) return [...manifestPaths].sort();
  const out: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(filesDir, full).replace(/\\/g, '/'));
    }
  }
  walk(filesDir);
  for (const manifestPathEntry of manifestPaths) out.push(manifestPathEntry);
  return [...new Set(out)].sort();
}
