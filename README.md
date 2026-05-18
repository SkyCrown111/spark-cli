# SparkCLI

AI CLI for game developers — Cocos Creator, staging-safe file writes, user-selected LLM providers.

> **开发按 Phase 推进**：总览 [docs/ROADMAP.md](./docs/ROADMAP.md) → **Phase 1–11 已完成**（含 SparkCLI Cloud 本地 mock）。  
> 产品愿景：[SparkCLI-产品设计文档.md](./SparkCLI-产品设计文档.md).

### 开发阶段一览

| Phase | 文档 | 状态 |
|-------|------|------|
| 1 基础 | [PHASE-1.md](./docs/PHASE-1.md) | ✅ 已完成 |
| 2 生成/场景 | [PHASE-2.md](./docs/PHASE-2.md) | ✅ 已完成 |
| 3 MCP / Bridge | [PHASE-3.md](./docs/PHASE-3.md) | ✅ 已完成 |
| 4 微信构建 | [PHASE-4.md](./docs/PHASE-4.md) | ✅ 已完成 |
| 5 多平台 adapt | [PHASE-5.md](./docs/PHASE-5.md) | ✅ 已完成 |
| 6 Unity | [PHASE-6.md](./docs/PHASE-6.md) | ✅ 已完成 |
| 7 识图/Figma | [PHASE-7.md](./docs/PHASE-7.md) | ✅ 已完成 |
| 8 发布/插件 | [PHASE-8.md](./docs/PHASE-8.md) | ✅ 已完成 |
| 9 关卡/Anim | [PHASE-9.md](./docs/PHASE-9.md) | ✅ 已完成 |
| 10 Unreal/Godot | [PHASE-10.md](./docs/PHASE-10.md) | ✅ 已完成 |
| 11 Cloud | [PHASE-11.md](./docs/PHASE-11.md) | ✅ 已完成 |
| 12 Agent UX | [PHASE-12.md](./docs/PHASE-12.md) | ✅ 已完成 |

## Requirements

- Node.js **20+**
- (Optional) Cocos Creator **3.8** for full workflow
- An LLM API key (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, etc.)

## Install (from source)

```bash
cd spark-cli
pnpm install
pnpm build
pnpm link --global   # or: node dist/cli.js
```

Global config: `~/.spark-cli/config.yaml` (Windows: `%USERPROFILE%\.spark-cli\config.yaml`).

### Custom provider (e.g. 小米 MiMo)

Put the API key in **`api_key`** (in config) **or** use **`key_env`** as an environment variable **name** (not the token).

```yaml
# ~/.spark-cli/config.yaml
model:
  provider: mimo
  default: mimo-v2.5-pro          # lowercase model id (see platform docs)
providers:
  custom_providers:
    - name: mimo
      base_url: https://token-plan-cn.xiaomimimo.com/v1
      api_key: "your-mimo-token"  # option A: key in config file
      # key_env: MIMO_API_KEY     # option B: $env:MIMO_API_KEY in PowerShell
      api_mode: openai
```

```powershell
# option B only:
$env:MIMO_API_KEY = "your-token-here"
spark-cli doctor
spark-cli model use mimo/mimo-v2.5-pro
```

Wrong: `key_env: tp-xxxx` (the token). Wrong model id: `mimo-V2.5-pro` (use `mimo-v2.5-pro`).

## Quick start

```bash
cd fixtures/cocos-3.8-mini   # or your Cocos project
spark-cli init
spark-cli model use openai/gpt-4o   # or mimo/mimo-v2-flash with custom provider
spark-cli doctor

# Claude-style interactive session (default when you run `spark-cli` alone)
spark-cli
# Spark — SparkCLI mascot — Claude-style welcome + orange `> ` prompt
# then: describe your task → /diff → /apply → /exit
# spark-cli --no-mascot   # or SPARK_CLI_NO_MASCOT=1 to hide Spark

# One-shot (still supported)
spark-cli chat "创建一个测试组件"
spark-cli diff
spark-cli apply
spark-cli validate
```

## Commands

**Phase 1（正式范围）**

| Command | Description |
|---------|-------------|
| `spark-cli init` | Create `spark-cli.config.yaml`, `.spark-cli/`, `.spark-cliignore` |
| `spark-cli doctor` | Environment and config checks |
| `spark-cli model list \| use \| current \| test` | User-selected LLM provider/model |
| `spark-cli chat <prompt>` | LLM codegen → staging |
| `spark-cli diff \| apply \| revert` | Staging workflow |
| `spark-cli validate` | `tsc` + Cocos layout + `scene_integrity` |

**Phase 2**

| Command | Description |
|---------|-------------|
| `spark-cli gen [prompt]` | Generate component/system code → staging |
| `spark-cli ui <prompt>` | UI script generation → staging |
| `spark-cli scene list \| analyze \| optimize \| open` | Scene ops; `open` needs [spark-cli-bridge](./docs/bridge.md) |
| `spark-cli knowledge index \| search \| add` | Local knowledge base (BM25) |
| `spark-cli memory show \| add \| clear` | Project/session memory |

**Phase 3**

| Command | Description |
|---------|-------------|
| `spark-cli mcp serve` | MCP server for Cursor — [docs/mcp.md](./docs/mcp.md) |
| `spark-cli scene open <path>` | Open scene in Cocos via WebSocket bridge |

**Phase 4（微信）** — [docs/wechat.md](./docs/wechat.md)

| Command | Description |
|---------|-------------|
| `spark-cli build wechat \| analyze \| suggest-split` | Build / size report / split hints |
| `spark-cli adapt wechat [--fix]` | Compliance checks + `.spark-cli` reports |
| `spark-cli publish wechat --env preview` | WeChat DevTools CLI upload |
| `spark-cli asset list \| analyze \| unused \| import` | Asset utilities |

**Phase 5（多平台）** — [docs/platforms.md](./docs/platforms.md)

| Command | Description |
|---------|-------------|
| `spark-cli adapt douyin \| alipay \| huawei` | Platform compliance reports |
| `spark-cli publish douyin \| alipay \| huawei --dry-run` | Publish CLI skeleton |

**Phase 6（Unity）** — [docs/unity.md](./docs/unity.md)

| Command | Description |
|---------|-------------|
| `spark-cli gen` / `chat` | C# generation when Unity project detected |
| `spark-cli validate` | `dotnet build` for Unity layouts |
| Editor package | `packages/unity/com.spark-cli.bridge` → **SparkCLI → Apply Staging** |

**Phase 7（视觉输入）** — [docs/vision.md](./docs/vision.md)

| Command | Description |
|---------|-------------|
| `spark-cli ui --image <png>` | Screenshot → `tasks.vision` model |
| `spark-cli ui --figma <url>` | Figma API layout summary |
| `spark-cli ui --sketch <json>` | Sketch export JSON |

**后续 Phase（见 ROADMAP）**

| Command | Phase |
|---------|-------|
| `spark-cli level` / `editor` | 9 |

**Phase 8（质量）**

| Command | Description |
|---------|-------------|
| `spark-cli replay export` | Session log + staging → `replay.json` |
| `spark-cli plugin install <path>` | Local plugins — [CONTRIBUTING.md](./CONTRIBUTING.md) |

Full command list: [docs/COMMANDS.md](./docs/COMMANDS.md). Publish: [docs/PUBLISHING.md](./docs/PUBLISHING.md).

## Config

- Global: `~/.spark-cli/config.yaml`
- Project: `spark-cli.config.yaml` in project root

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:phase1   # Phase 1 自动化验收
pnpm test:phase2   # Phase 2 自动化验收
pnpm test:phase3   # Phase 3 自动化验收
pnpm test:phase4   # Phase 4 自动化验收
pnpm test:phase5   # Phase 5 自动化验收
pnpm test:phase6   # Phase 6 自动化验收
pnpm test:phase7   # Phase 7 自动化验收
pnpm test:phase8   # Phase 8 自动化验收
node dist/cli.js doctor
```

## License

MIT
