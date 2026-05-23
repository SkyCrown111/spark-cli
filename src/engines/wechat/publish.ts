import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SparkCLIConfig } from '../../config/schema.js';
import { findWechatBuildDir } from './build-analyzer.js';

export interface PublishWechatResult {
  ok: boolean;
  command: string;
  message: string;
  dryRun: boolean;
}

const DEFAULT_DEVTOOLS_CLI = 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';

export function publishWechat(
  projectRoot: string,
  config: SparkCLIConfig,
  options: { env: 'preview' | 'production'; dryRun?: boolean },
): PublishWechatResult {
  const buildDir = findWechatBuildDir(projectRoot);
  if (!buildDir) {
    return {
      ok: false,
      command: '',
      message: 'No build/wechatgame — run `spark-cli build wechat` first',
      dryRun: Boolean(options.dryRun),
    };
  }

  const cli =
    config.wechat?.devtoolsPath ?? process.env.WECHAT_DEVTOOLS_CLI ?? DEFAULT_DEVTOOLS_CLI;
  const appid = config.wechat?.appid ?? process.env.WECHAT_APPID;

  if (!appid) {
    return {
      ok: false,
      command: '',
      message: 'Missing wechat.appid in .spark/settings.json or WECHAT_APPID env',
      dryRun: Boolean(options.dryRun),
    };
  }

  const uploadType = options.env === 'preview' ? 'preview' : 'upload';
  const args = [
    '-u',
    appid,
    uploadType === 'preview' ? '--preview' : '--upload',
    '--project',
    buildDir,
  ];

  const cmd = `"${cli}" ${args.join(' ')}`;

  if (!existsSync(cli) && !process.env.WECHAT_DEVTOOLS_CLI) {
    if (options.dryRun) {
      return {
        ok: true,
        command: cmd,
        message: 'Dry run — WeChat DevTools CLI not found; set wechat.devtoolsPath',
        dryRun: true,
      };
    }
    return {
      ok: false,
      command: cmd,
      message: `WeChat DevTools CLI not found: ${cli}`,
      dryRun: false,
    };
  }

  if (options.dryRun) {
    return { ok: true, command: cmd, message: 'Dry run — upload not executed', dryRun: true };
  }

  const r = spawnSync(cli, args, {
    encoding: 'utf8',
    shell: true,
    cwd: join(projectRoot),
  });

  return {
    ok: r.status === 0,
    command: cmd,
    message:
      r.status === 0
        ? `Published (${options.env})`
        : (r.stderr || r.stdout || 'Publish failed').slice(0, 800),
    dryRun: false,
  };
}
