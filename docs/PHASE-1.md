# Phase 1 — 基础框架

> **目标**：可安装的 CLI + 用户自选模型 + Cocos 项目识别 + `chat` + staging 安全写盘。  
> **周期**：约 2 周  
> **状态**：✅ 已完成（2026-05）  
> **总路线图**：[ROADMAP.md](./ROADMAP.md)

---

## 本 Phase 交付（仅下列内容）

### 命令

| 命令 | 状态 |
|------|------|
| `spark-cli --version` | ✅ |
| `spark-cli init` | ✅ |
| `spark-cli doctor` | ✅ |
| `spark-cli model list \| use \| current \| test` | ✅ |
| `spark-cli chat <prompt>` | ✅ |
| `spark-cli diff \| apply \| revert` | ✅ |
| `spark-cli validate` | ✅ |

### 核心模块

- [x] `src/config/schema.ts` + `load.ts`（Zod + cosmiconfig）
- [x] `src/core/providers/router.ts` + OpenAI 兼容 / Anthropic
- [x] `src/core/staging/patch-manager.ts`
- [x] `src/core/context/project-scanner.ts`（供 chat 上下文）
- [x] `src/engines/cocos/detector.ts`
- [x] `fixtures/cocos-3.8-mini/`
- [x] CI：`typecheck` + `test` + `build` + `test:phase1`

### 明确不在 Phase 1

- `gen`、`ui`、`scene` → **Phase 2**
- `mcp serve` → **Phase 3**
- `build` / `adapt` / `publish` → **Phase 4**

---

## Phase 1 验收清单

- [x] `pnpm build` && `pnpm test` && `pnpm typecheck` 通过
- [x] `pnpm test:phase1`（`scripts/phase1-accept.mjs`）通过
- [x] `spark-cli doctor` 在无项目目录有清晰输出
- [x] `spark-cli model use <provider>/<model>` 写入 `~/.spark-cli/config.yaml`
- [x] `spark-cli model test` 在配置有效 Key 时成功（需本机真实 Key；CI 仅验 doctor/env）
- [x] staging：`patch-manager` 单测 + `apply` 无 staging 失败
- [x] 未配置 Key 时 `chat` 退出码 2 且提示明确
- [x] `revert` 清空 staging（单测覆盖）
- [x] README 快速开始与 Phase 1 一致

### 需本机手动执行（有真实 API Key 时）

```bash
cd fixtures/cocos-3.8-mini
spark-cli init
spark-cli model use deepseek/deepseek-chat   # 或你的 provider
export DEEPSEEK_API_KEY=sk-...
spark-cli chat "创建一个测试组件"
spark-cli diff
spark-cli apply
spark-cli validate
```

---

## 完成后

Phase 1 ✅ → 当前进入 **[PHASE-2.md](./PHASE-2.md)**（仅做 Phase 2 清单内项）。
