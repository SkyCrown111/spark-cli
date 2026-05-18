# Phase 2 — 生成与场景

> **前置**：Phase 1 ✅  
> **目标**：`gen` / `ui`（文本）、场景只读分析、知识库与记忆、校验增强。  
> **周期**：约 3 周  
> **状态**：✅ 已完成

---

## 本 Phase 交付

### 命令

| 命令 | 状态 | 说明 |
|------|------|------|
| `spark-cli gen [prompt]` | [x] | `--type component\|system` |
| `spark-cli ui <prompt>` | [x] | 文本 UI 生成 |
| `spark-cli scene list` | [x] | |
| `spark-cli scene analyze <path>` | [x] | Cocos 3.x JSON 解析 |
| `spark-cli scene optimize <path>` | [x] | 静态优化建议 |
| `spark-cli scene batch` | [ ] | 延后（依赖 LLM + scene 写入） |
| `spark-cli knowledge index \| search \| add` | [x] | 本地 BM25 |
| `spark-cli memory show \| add \| clear` | [x] | session + project memory |
| `validate` 增强 | [x] | `scene_integrity` 基础检查 |

### 模块

- [x] `scene-parser.ts` / `scene-list.ts`
- [x] `prompt-builder` UI 分支 + 知识库/记忆注入
- [x] `core/knowledge/indexer.ts` + `retriever.ts`
- [x] `core/memory/store.ts`
- [x] `core/validate/scene-integrity.ts`
- [x] `engines/cocos/scene-optimize.ts`

---

## 不在 Phase 2

- MCP Server 写入 → Phase 3  
- `ui --image` / Figma → Phase 7  
- 场景**写入**（改 .scene JSON）→ Phase 3 起 + `allowWrite`  
- 微信构建 → Phase 4  

---

## Phase 2 验收清单

- [x] Phase 1 已验收
- [x] `spark-cli gen --type component "..."` 生成可 staging 的组件（需 API key 手测 `apply` + `tsc`）
- [x] `spark-cli ui` / `scene analyze` 可用
- [x] `spark-cli knowledge search "微信分包"` 返回知识库片段
- [x] `spark-cli memory add` / `show` 可用
- [x] `validate` 含 `scene_integrity`（`pnpm test:phase2`）
- [x] 文档 PHASE-2 与 README 命令表一致

自动化：`pnpm test:phase2`

---

## 完成后

ROADMAP Phase 2 → ✅，开始 [PHASE-3.md](./PHASE-3.md)。
