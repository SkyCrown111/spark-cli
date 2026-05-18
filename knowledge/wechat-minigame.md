# 微信小游戏 — 包体与分包

- 主包建议不超过 **4MB**（具体以当前微信文档为准）。
- 使用分包加载非首屏资源；首屏尽量只保留启动必需资源。
- 纹理启用压缩（ASTC/ETC2/PVRTC 依平台），避免 4K 未压缩 PNG。
- 首屏场景节点数量尽量控制，减少 DrawCall。

# 检查命令

使用 `spark-cli adapt wechat`（Phase 4）做完整检查；Phase 2 可用 `spark-cli validate` 做基础校验。
