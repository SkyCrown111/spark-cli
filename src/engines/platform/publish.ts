import { existsSync } from 'node:fs';
import type { SparkCLIConfig } from '../../config/schema.js';
import type { PlatformId } from '../../core/validate/platform-rules.js';
import { getPlatform } from '../../platforms/registry.js';
import { findPlatformBuildDir } from './build-analyzer.js';

export interface PublishPlatformResult {
  ok: boolean;
  command: string;
  message: string;
  dryRun: boolean;
}

interface PlatformPublishConfig {
  cliPath?: string;
  devtoolsPath?: string;
  appid?: string;
}

function platformConfig(
  config: SparkCLIConfig,
  platform: PlatformId,
): PlatformPublishConfig | undefined {
  if (platform === 'wechat') return config.wechat;
  if (platform === 'douyin') return config.douyin;
  if (platform === 'alipay') return config.alipay;
  if (platform === 'huawei') return config.huawei;
  return undefined;
}

const DEFAULT_CLI: Partial<Record<PlatformId, string>> = {
  douyin: 'tt-minigame-ci',
  alipay: 'miniprogram-ci',
  huawei: 'hwfastapp-cli',
};

export function publishPlatform(
  platform: PlatformId,
  projectRoot: string,
  config: SparkCLIConfig,
  options: { env: 'preview' | 'production'; dryRun?: boolean },
): PublishPlatformResult {
  const def = getPlatform(platform)!;
  const buildDir = findPlatformBuildDir(projectRoot, platform);
  if (!buildDir) {
    return {
      ok: false,
      command: '',
      message: `No build output for ${def.label} — run a platform build first`,
      dryRun: Boolean(options.dryRun),
    };
  }

  const pc = platformConfig(config, platform);
  const cliPath =
    pc?.cliPath ??
    pc?.devtoolsPath ??
    (def.envCli ? process.env[def.envCli] : undefined) ??
    DEFAULT_CLI[platform] ??
    '';
  const appid = pc?.appid ?? (def.envAppId ? process.env[def.envAppId] : undefined);

  const uploadFlag = options.env === 'preview' ? '--preview' : '--upload';
  const cmd = cliPath
    ? `"${cliPath}" ${uploadFlag} --project "${buildDir}"${appid ? ` --appid ${appid}` : ''}`
    : `(set ${platform}.cliPath) ${uploadFlag} --project "${buildDir}"`;

  if (!appid && platform !== 'huawei') {
    if (options.dryRun) {
      return {
        ok: true,
        command: cmd,
        message: `Dry run — set ${platform}.appid or ${def.envAppId} before real upload`,
        dryRun: true,
      };
    }
    return {
      ok: false,
      command: cmd,
      message: `Missing ${platform}.appid in config or ${def.envAppId} env`,
      dryRun: false,
    };
  }

  if (!cliPath || (!existsSync(cliPath) && !process.env[def.envCli ?? ''])) {
    if (options.dryRun) {
      return {
        ok: true,
        command: cmd,
        message: `Dry run — ${def.label} CLI not configured; set ${platform}.cliPath`,
        dryRun: true,
      };
    }
    return {
      ok: false,
      command: cmd,
      message: `${def.label} publish CLI not found. Configure ${platform}.cliPath (skeleton only in Phase 5).`,
      dryRun: false,
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      command: cmd,
      message: `Dry run — ${def.label} upload not executed`,
      dryRun: true,
    };
  }

  return {
    ok: false,
    command: cmd,
    message: `${def.label} publish is a skeleton in Phase 5 — run the printed command with your platform CI tool`,
    dryRun: false,
  };
}
