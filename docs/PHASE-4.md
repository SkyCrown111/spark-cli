# Phase 4 — 微信小游戏与资源

> **前置**：Phase 3 ✅  
> **周期**：约 2 周  
> **状态**：✅ 已完成

## 交付

- [x] `spark-cli build wechat` / `build analyze` / `build suggest-split`
- [x] `spark-cli adapt wechat` / `adapt wechat --fix`
- [x] `spark-cli publish wechat --env preview`
- [x] `spark-cli asset list|import|analyze|unused`
- [x] `rules/wechat.json` 可热更新（`.spark-cli/rules/` 或 `rules/` 覆盖）
- [x] `core/validate/wechat-limits.ts`

## 验收

- [x] fixture `build/wechatgame` 输出主包/分包大小（`build analyze --json`）
- [x] `adapt wechat` 与 `rules/wechat.json` 限制对比
- [x] [docs/wechat.md](./wechat.md) 记录 DevTools / Creator CLI 配置

自动化：`pnpm test:phase4`

手测：`build wechat`、`publish wechat` 需本机 Cocos Creator 与微信开发者工具。

---

## 完成后

开始 [PHASE-5.md](./PHASE-5.md)。
