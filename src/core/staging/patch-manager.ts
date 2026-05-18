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
import { dirname, join, relative } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { getProjectSparkDir, getStagingDir } from '../../config/paths.js';
import { SparkCLIError } from '../../utils/errors.js';
import { runHooks } from '../hooks/runner.js';

export interface StagedFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
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

export function stageWriteFile(
  projectRoot: string,
  relativePath: string,
  content: string,
): void {
  const sparkDir = getProjectSparkDir(projectRoot);
  if (!existsSync(join(sparkDir, 'staging', 'manifest.json'))) {
    initStaging(projectRoot);
  }
  const target = join(projectRoot, relativePath);
  const staged = join(stagingRoot(projectRoot), 'files', relativePath);
  const action: StagedFile['action'] = existsSync(target) ? 'modify' : 'create';

  mkdirSync(dirname(staged), { recursive: true });
  writeFileSync(staged, content, 'utf8');

  const manifest = loadManifest(projectRoot);
  const existing = manifest.files.findIndex((f) => f.path === relativePath);
  const entry: StagedFile = { path: relativePath, action };
  if (existing >= 0) manifest.files[existing] = entry;
  else manifest.files.push(entry);
  writeFileSync(manifestPath(projectRoot), JSON.stringify(manifest, null, 2));
}

/** Stage binary content (audio, images) without UTF-8 coercion. */
export function stageWriteBuffer(
  projectRoot: string,
  relativePath: string,
  content: Buffer,
): void {
  const sparkDir = getProjectSparkDir(projectRoot);
  if (!existsSync(join(sparkDir, 'staging', 'manifest.json'))) {
    initStaging(projectRoot);
  }
  const target = join(projectRoot, relativePath);
  const staged = join(stagingRoot(projectRoot), 'files', relativePath);
  const action: StagedFile['action'] = existsSync(target) ? 'modify' : 'create';

  mkdirSync(dirname(staged), { recursive: true });
  writeFileSync(staged, content);

  const manifest = loadManifest(projectRoot);
  const existing = manifest.files.findIndex((f) => f.path === relativePath);
  const entry: StagedFile = { path: relativePath, action };
  if (existing >= 0) manifest.files[existing] = entry;
  else manifest.files.push(entry);
  writeFileSync(manifestPath(projectRoot), JSON.stringify(manifest, null, 2));
}

export function showDiff(projectRoot: string): string {
  if (!hasStaging(projectRoot)) {
    return '';
  }
  const manifest = loadManifest(projectRoot);
  const parts: string[] = [];
  for (const file of manifest.files) {
    const staged = join(stagingRoot(projectRoot), 'files', file.path);
    const target = join(projectRoot, file.path);
    const oldContent = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const newContent = existsSync(staged) ? readFileSync(staged, 'utf8') : '';
    const patch = createTwoFilesPatch(
      file.path,
      file.path + ' (staged)',
      oldContent,
      newContent,
    );
    parts.push(patch);
  }
  return parts.join('\n');
}

export function applyStaging(
  projectRoot: string,
  options: { yes?: boolean; backup?: boolean; dryRun?: boolean },
): string[] {
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
      ['Inspect .spark-cli/hooks/config.json or run with hooks disabled.'],
    );
  }

  for (const file of manifest.files) {
    const staged = join(stagingRoot(projectRoot), 'files', file.path);
    const target = join(projectRoot, file.path);
    if (options.backup && existsSync(target)) {
      const backupDir = join(getProjectSparkDir(projectRoot), 'backups');
      mkdirSync(backupDir, { recursive: true });
      const stamp = Date.now();
      copyFileSync(
        target,
        join(backupDir, `${stamp}-${file.path.replace(/[/\\]/g, '_')}`),
      );
    }
    mkdirSync(dirname(target), { recursive: true });
    const content = readFileSync(staged, 'utf8');
    writeFileSync(target, content, 'utf8');
    applied.push(file.path);
  }

  clearStaging(projectRoot);
  return applied;
}

export function listStagedFiles(projectRoot: string): string[] {
  if (!hasStaging(projectRoot)) return [];
  return loadManifest(projectRoot).files.map((f) => f.path);
}

export function listAllStagedPaths(projectRoot: string): string[] {
  const filesDir = join(stagingRoot(projectRoot), 'files');
  if (!existsSync(filesDir)) return [];
  const out: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(filesDir, full).replace(/\\/g, '/'));
    }
  }
  walk(filesDir);
  return out;
}
