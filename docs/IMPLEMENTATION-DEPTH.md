# 实现深度补强计划

> 针对「能力有、但偏薄」的模块，按优先级逐项加深。完成一项即在表中打 ✅。

## 优先级说明

| 级别 | 含义 |
|------|------|
| P0 | 用户易踩坑、错误信息差、文档与行为不一致 |
| P1 | 核心路径可用但为 mock/regex 降级 |
| P2 | 可选依赖、大项目 fixture、非主路径 |

---

## 任务清单

| # | 区域 | 问题 | 交付 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 1 | 文档 | `ROADMAP.md` 仍写 knowledge/memory/bridge「未做」 | 更新为与代码一致的历史说明 | P0 | ✅ |
| 2 | 工具库 | 无可选依赖统一探测 | `src/utils/optional-module.ts` + 单测 | P1 | ✅ |
| 3 | Agent | `subagent.model` 配置错误时静默或难排查 | `spawnSubAgent` 提前校验并返回 `isError` | P0 | ✅ |
| 4 | 生成 | `image-gen` 启用 openai 仍走 mock | `OpenAIImageGenProvider`（Images API） | P1 | ✅ |
| 5 | 生成 | `audio-gen` 忽略 `provider: elevenlabs` | 按配置解析；未实现 provider 明确报错 | P1 | ✅ |
| 6 | 诊断 | `doctor` 不展示降级能力 | `parity.capabilities` 快照 | P0 | ✅ |
| 7 | Unreal | C++ 索引仅 regex，用户不知 | `getCppIndexBackend()` + doctor 展示 | P1 | ✅ |
| 8 | 测试 | 子代理/生成路径覆盖不足 | `sub-agent` / `image-gen` / `optional-module` 测试 | P1 | ✅ |
| 9 | Assets | Phase 14 设计 optional（sharp 等）未接入 | `image-dims.ts` + async `auditAssets`（sharp/WebP） | P2 | ✅ |
| 10 | Unreal | tree-sitter-cpp 可选 AST | `cpp-index-ast.ts` + 与 regex 合并 | P2 | ✅ |
| 11 | Cloud | 仅 mock 后端 | 真实 Cloud API（独立 Phase） | — | 延后 |
| 12 | Bridge | 需编辑器在线 | [BRIDGE.md](./BRIDGE.md) + `bridgeRequest` 重试 | P2 | ✅ |

---

## 验收

```bash
pnpm typecheck
pnpm exec vitest run src/utils/optional-module.test.ts \
  src/core/providers/image-gen.test.ts \
  src/core/agent/sub-agent.test.ts
spark-cli doctor --json | jq '.parity.capabilities'
```

---

## 与 Phase 14 的关系

本计划不新增 ROADMAP Phase；属于 **0.3.x 质量加深**，与 `PHASE-14.md` 中已 ✅ 的交付项互补（把「有接口」变成「可依赖」）。
