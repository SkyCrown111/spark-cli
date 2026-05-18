# Phase 11 — SparkCLI Cloud

> **前置**：Phase 8 ✅  
> **状态**：✅ 已完成

## 交付

- [x] `spark-cli cloud login|logout|keys|push|pull`
- [x] 云端 Key 代理 LLM（本地仍可不用云）
- [x] 团队权限与 replay 审计（可选）

## 验收

- [x] `cloud login` + `keys use` 代理调用成功
- [x] 未登录时纯本地模式不受影响

验收：`pnpm test:phase11`（含本地 mock API：`spark-cli cloud serve`）
