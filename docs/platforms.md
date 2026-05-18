# Minigame platforms (Phase 5)

## Adapt commands

```bash
spark-cli adapt wechat
spark-cli adapt douyin
spark-cli adapt alipay
spark-cli adapt huawei

spark-cli adapt douyin --fix    # writes .spark-cli/douyin-adapt-report.json
spark-cli adapt wechat --json
```

Checks include:

- Build output package sizes vs `rules/<platform>.json`
- Large textures under `assets/`
- First-screen scene node count
- AppID in config (when `requirements.appidRequired`)

## Hot-updated rules

| Platform | Default file | Override |
|----------|--------------|----------|
| wechat | `rules/wechat.json` | `.spark-cli/rules/wechat.json` |
| douyin | `rules/douyin.json` | `.spark-cli/rules/douyin.json` |
| alipay | `rules/alipay.json` | `.spark-cli/rules/alipay.json` |
| huawei | `rules/huawei.json` | `.spark-cli/rules/huawei.json` |

## Config

```yaml
douyin:
  cliPath: 'C:/path/to/tt-minigame-ci'
  appid: 'ttxxxxxxxx'

alipay:
  cliPath: 'C:/path/to/miniprogram-ci'
  appid: '2021xxxxxxxx'

huawei:
  cliPath: 'C:/path/to/hwfastapp-cli'
  appid: 'optional'
```

Environment: `DOUYIN_APPID`, `DOUYIN_DEVTOOLS_CLI`, etc. (see `src/platforms/registry.ts`).

## Build output directories (Cocos)

| Platform | Typical `build/` folder |
|----------|-------------------------|
| WeChat | `wechatgame/` |
| Douyin | `bytedance-mini-game/` |
| Alipay | `alipay-mini-game/` |
| Huawei | `huawei-quick-game/` |

## Publish (skeleton)

```bash
spark-cli publish wechat --env preview      # full WeChat DevTools integration (Phase 4)
spark-cli publish douyin --env preview --dry-run
spark-cli publish alipay --env preview --dry-run
spark-cli publish huawei --env preview --dry-run
```

Douyin/Alipay/Huawei publish prints the CI command template; wire your platform tool and set `cliPath` / `appid`.

## Fixture

`fixtures/cocos-3.8-mini/build/` contains mock `wechatgame/` and `bytedance-mini-game/` trees for `pnpm test:phase5` without real builds.
