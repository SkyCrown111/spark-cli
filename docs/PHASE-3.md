# Phase 3 — MCP 与编辑器桥接

> **前置**：Phase 2 ✅  
> **目标**：MCP 与 CLI 能力对齐；Editor Bridge 原型；场景写操作（受 `mcp.allowWrite` 控制）。  
> **周期**：约 2 周  
> **状态**：✅ 已完成

---

## 本 Phase 交付

### MCP

| 项 | 状态 | 说明 |
|----|------|------|
| `spark-cli mcp serve` | [x] | stdio |
| Resources: project/info, structure, scene/tree | [x] | |
| Tools: scene_list, scene_analyze, validate_project | [x] | 只读 |
| Tools: scene_add_node, component_update（写） | [x] | 需 `mcp.allowWrite: true`，走 staging |
| 与 staging 共用写盘 | [x] | `stageWriteFile` |
| [docs/mcp.md](./mcp.md) | [x] | Cursor 配置与写工具说明 |

### Editor Bridge

| 项 | 状态 |
|----|------|
| Cocos 扩展 `extensions/spark-cli-bridge` 原型 | [x] |
| WebSocket `scene.open` / `selection.get` | [x] |
| `spark-cli scene open <path>` 调 Bridge | [x] |
| [docs/bridge.md](./bridge.md) | [x] |

### 配置

- [x] `mcp.allowWrite` / `mcp.port` 在 schema 与 `loadMergedConfig` 中生效（默认 `false` / `17321`）

---

## Phase 3 验收清单

- [x] Phase 2 已验收
- [x] MCP 可读 scene tree（resource + `scene_analyze`）
- [x] 写工具在 `allowWrite: false` 时被拒绝
- [x] 写工具在 `allowWrite: true` 时走 staging（`pnpm test` + `test:phase3`）
- [x] Editor Bridge 文档与扩展原型（Cocos 内 `scene open` 需手测，见 [bridge.md](./bridge.md)）

自动化：`pnpm test:phase3`

---

## 完成后

开始 [PHASE-4.md](./PHASE-4.md)。
