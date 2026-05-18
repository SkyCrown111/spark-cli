# Cocos Creator 3.x 最佳实践

- UI 根节点使用 **Widget** 做屏幕适配。
- 列表用 **ScrollView + Layout**，大量项考虑虚拟列表或对象池。
- 组件脚本放在 `assets/scripts/`，场景在 `assets/scenes/`。
- 避免在 `update` 中频繁 `getComponent` 或查找节点，缓存引用。
- 发布前运行 TypeScript 编译与 `spark-cli validate`。
