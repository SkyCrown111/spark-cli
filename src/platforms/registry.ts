import type { PlatformId } from '../core/validate/platform-rules.js';

export interface PlatformDefinition {
  id: PlatformId;
  label: string;
  buildDirNames: string[];
  envCli?: string;
  envAppId?: string;
}

export const PLATFORMS: Record<PlatformId, PlatformDefinition> = {
  wechat: {
    id: 'wechat',
    label: 'WeChat',
    buildDirNames: ['wechatgame', 'wechat-game', 'wechat'],
    envCli: 'WECHAT_DEVTOOLS_CLI',
    envAppId: 'WECHAT_APPID',
  },
  douyin: {
    id: 'douyin',
    label: 'Douyin',
    buildDirNames: ['bytedance-mini-game', 'douyin', 'tt-mini-game'],
    envCli: 'DOUYIN_DEVTOOLS_CLI',
    envAppId: 'DOUYIN_APPID',
  },
  alipay: {
    id: 'alipay',
    label: 'Alipay',
    buildDirNames: ['alipay-mini-game', 'alipay', 'alipay-minigame'],
    envCli: 'ALIPAY_DEVTOOLS_CLI',
    envAppId: 'ALIPAY_APPID',
  },
  huawei: {
    id: 'huawei',
    label: 'Huawei Quick Game',
    buildDirNames: ['huawei-quick-game', 'huawei', 'huawei-minigame'],
    envCli: 'HUAWEI_DEVTOOLS_CLI',
    envAppId: 'HUAWEI_APPID',
  },
};

export function getPlatform(id: string): PlatformDefinition | null {
  return PLATFORMS[id as PlatformId] ?? null;
}
