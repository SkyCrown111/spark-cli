# Phase 6 — Unity 对等

> **前置**：Phase 2 ✅（生成链路）  
> **状态**：✅ 已完成

## 交付

- [x] `engines/unity/*` detector、`dotnet-validate`、C# 提取与 prompt
- [x] `spark-cli validate` 集成 `dotnet build`（Unity 项目）
- [x] Editor `Packages/com.spark-cli.bridge` — **SparkCLI → Apply Staging**
- [x] `fixtures/unity-mini/`

## 验收

- [x] fixture：`dotnet build` + `validate --json`（`pnpm test:phase6`）
- [x] 文档 [unity.md](./unity.md)：gen → apply → validate 流程

自动化：`pnpm test:phase6`

手测：真实 Unity 2022 LTS 项目 + `spark-cli gen` + Editor Apply。

---

## 完成后

开始 [PHASE-7.md](./PHASE-7.md)。
