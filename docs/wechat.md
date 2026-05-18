# WeChat Minigame (Phase 4)

## Config

In `spark-cli.config.yaml`:

```yaml
wechat:
  devtoolsPath: 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
  appid: 'wxxxxxxxxxxx'

project:
  creatorPath: 'C:/Program Files/Cocos/Creator/3.8.0/CocosCreator.exe'
```

Environment overrides:

| Variable | Purpose |
|----------|---------|
| `WECHAT_DEVTOOLS_CLI` | Path to WeChat DevTools `cli.bat` |
| `WECHAT_APPID` | Mini program AppID |
| `COCOS_CREATOR_PATH` | Cocos Creator executable |

## Commands

```bash
spark-cli build wechat              # Cocos Creator CLI build (or --dry-run)
spark-cli build analyze             # Main/sub/total vs rules/wechat.json
spark-cli build suggest-split       # Heuristic subpackage suggestions

spark-cli adapt wechat              # Package + assets + scene checks
spark-cli adapt wechat --fix        # Write .spark-cli/wechat-adapt-report.json

spark-cli publish wechat --env preview   # WeChat DevTools upload (needs appid)

spark-cli asset list [--type texture]
spark-cli asset analyze
spark-cli asset unused
spark-cli asset import ./icon.png --to assets/textures/icon.png
```

## Hot-updated limits

Default limits live in `rules/wechat.json` (bundled with SparkCLI).

Override per project (first match wins):

1. `.spark-cli/rules/wechat.json`
2. `rules/wechat.json` in project root

## WeChat DevTools CLI

Install [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html), then enable **设置 → 安全 → 服务端口**.

Typical CLI (paths vary by install):

```bat
cli.bat -u <appid> --preview --project <path-to-build/wechatgame>
```

`spark-cli publish wechat --dry-run` prints the exact command without executing.

## Cocos build

```bash
"CocosCreator.exe" --project . --build "platform=wechatgame;debug=false"
```

Output directory: `build/wechatgame/` (includes `game.json` for subpackages).

## Fixture

`fixtures/cocos-3.8-mini/build/wechatgame/` contains a minimal mock build for `pnpm test:phase4` without Creator or DevTools installed.
