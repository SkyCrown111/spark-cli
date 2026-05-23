import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { SparkCLIConfig } from '../../config/schema.js';

export interface BuildWechatResult {
  ok: boolean;
  command: string;
  message: string;
  exitCode?: number;
  dryRun: boolean;
}

const DEFAULT_CREATOR_WIN = 'C:/Program Files/Cocos/Creator/3.8.0/CocosCreator.exe';

export function buildWechatCocos(
  projectRoot: string,
  config: SparkCLIConfig,
  options: { dryRun?: boolean; preview?: boolean },
): BuildWechatResult {
  const creator =
    config.project?.creatorPath ??
    process.env.COCOS_CREATOR_PATH ??
    (process.platform === 'win32' ? DEFAULT_CREATOR_WIN : 'CocosCreator');

  const buildOpts = [
    'platform=wechatgame',
    'debug=false',
    options.preview ? 'buildPath=project://build/wechatgame-preview' : '',
  ]
    .filter(Boolean)
    .join(';');

  const cmd = `"${creator}" --project "${projectRoot}" --build "${buildOpts}"`;

  if (!existsSync(creator) && !process.env.COCOS_CREATOR_PATH) {
    if (options.dryRun) {
      return {
        ok: true,
        command: cmd,
        message: 'Dry run — Cocos Creator not found at default path; set project.creatorPath',
        dryRun: true,
      };
    }
    return {
      ok: false,
      command: cmd,
      message: `Cocos Creator not found: ${creator}. Set project.creatorPath in .spark/settings.json`,
      dryRun: false,
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      command: cmd,
      message: 'Dry run — build command not executed',
      dryRun: true,
    };
  }

  const r = spawnSync(creator, ['--project', projectRoot, '--build', buildOpts], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    ok: r.status === 0,
    command: cmd,
    message:
      r.status === 0 ? 'Build finished' : (r.stderr || r.stdout || 'Build failed').slice(0, 800),
    exitCode: r.status ?? undefined,
    dryRun: false,
  };
}
