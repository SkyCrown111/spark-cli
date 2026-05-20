# 终端调整大小重复渲染问题 - 调试指南

## 问题描述
您报告说在实际使用 SparkCLI 时，调整终端窗口大小仍然会导致重复渲染（欢迎信息和提示重复显示）。

## 已实施的修复
所有 24 个任务已完成，包括：
- ✅ Task 3: 加强 watchTtyResize 的防抖（resizePending 标志、大小去重、异步感知、200ms 超时）
- ✅ Task 4: 修复 rerenderLayout 的竞态条件（原子标志检查、try-finally）
- ✅ Task 5: 改进视口清除和 InputBox 协调
- ✅ Task 6: 使 handleTerminalResize 异步感知
- ✅ Task 7: 综合集成测试（16 个测试全部通过）

## 诊断步骤

### 步骤 1: 验证您运行的是最新构建

```bash
# 重新构建项目
pnpm build

# 验证构建文件包含修复
Get-Content dist/cli.js | Select-String -Pattern "resizePending" | Select-Object -First 3
Get-Content dist/cli.js | Select-String -Pattern "layoutRerendering" | Select-Object -First 3
```

**预期输出**: 应该看到 `resizePending` 和 `layoutRerendering` 变量

### 步骤 2: 运行诊断脚本

我创建了两个诊断脚本：

#### A. 基础 resize 事件监控
```bash
node debug-resize.mjs
```
然后调整终端大小，观察：
- 每次调整大小触发多少个 resize 事件？
- 是否有重复事件（大小未变化）？

#### B. 完整修复测试
```bash
node test-resize-live.mjs
```
然后调整终端大小，观察：
- `rerenderLayout called` 消息出现几次？
- `resizePending` 和 `layoutRerendering` 标志是否正确管理？
- 最终统计的比率是否接近 1.0？

### 步骤 3: 运行自动化测试

```bash
# 运行 resize 测试
pnpm exec vitest run src/commands/shell-resize.test.ts

# 运行集成测试
pnpm exec vitest run src/commands/shell-integration.test.ts

# 运行所有测试
pnpm test
```

**预期结果**: 所有测试应该通过（35/35）

### 步骤 4: 检查实际 CLI 行为

```bash
# 启动 SparkCLI
node dist/cli.js

# 或者如果已经 link
spark-cli
```

在 REPL 中：
1. 等待欢迎信息完全显示
2. 慢慢调整终端窗口大小（不要太快）
3. 观察是否有重复的欢迎信息

## 可能的原因

### 原因 1: 未使用最新构建
**症状**: 代码已修复但问题仍存在  
**解决方案**: 
```bash
pnpm build
node dist/cli.js  # 不要使用旧的全局安装版本
```

### 原因 2: 终端模拟器特定问题
**症状**: 某些终端会触发多个 resize 事件  
**解决方案**: 
- Windows Terminal: 通常工作正常
- 旧版 cmd.exe: 可能需要轮询
- PowerShell ISE: 不支持 resize 事件

**测试**: 运行 `debug-resize.mjs` 查看您的终端触发多少事件

### 原因 3: 快速连续调整大小
**症状**: 快速拖动窗口边缘导致多个重渲染  
**解决方案**: 这是预期行为 - 防抖设置为 200ms，所以快速调整会触发多次
**验证**: 慢慢调整大小（每次调整后等待 300ms）应该只触发一次重渲染

### 原因 4: 其他代码路径触发重渲染
**症状**: 不是 resize 导致的重复，而是其他事件  
**解决方案**: 检查是否有其他触发器（如 hook、插件等）

## 添加调试日志

如果问题仍然存在，可以临时添加调试日志：

### 修改 src/core/repl/viewport.ts

在 `watchTtyResize` 函数中添加：

```typescript
const schedule = (): void => {
  const nextCols = stdout.columns ?? 80;
  const nextRows = stdout.rows ?? 24;
  
  console.error(`[DEBUG] schedule: ${cols}x${rows} → ${nextCols}x${nextRows}, pending=${resizePending}`);
  
  if (nextCols === cols && nextRows === rows) {
    console.error('[DEBUG] Skipped: size unchanged');
    return;
  }
  // ... 其余代码
};
```

### 修改 src/commands/shell.ts

在 `rerenderLayout` 函数中添加：

```typescript
const rerenderLayout = async (): Promise<void> => {
  console.error(`[DEBUG] rerenderLayout: rerendering=${layoutRerendering}, active=${!!activeController}, closed=${sessionClosed}`);
  
  if (layoutRerendering || activeController || sessionClosed) {
    console.error('[DEBUG] Blocked');
    return;
  }
  // ... 其余代码
};
```

然后：
```bash
pnpm build
node dist/cli.js 2>debug.log
# 调整窗口大小
# 检查 debug.log 文件
```

## 预期行为

### 正常情况（修复后）
1. 调整终端大小
2. 等待 200ms（防抖）
3. 触发一次 `rerenderLayout`
4. 清除屏幕
5. 重新绘制欢迎信息（一次）
6. 重新绘制输入框（一次）

### 异常情况（Bug 存在时）
1. 调整终端大小
2. 触发多次 `rerenderLayout`（竞态条件）
3. 欢迎信息重复显示 2-3 次
4. 输入框重复显示 2-3 次

## 报告问题

如果问题仍然存在，请提供：

1. **终端信息**:
   ```bash
   echo $env:WT_SESSION  # Windows Terminal
   echo $env:TERM        # 终端类型
   ```

2. **Node 版本**:
   ```bash
   node --version
   ```

3. **诊断脚本输出**:
   ```bash
   node test-resize-live.mjs
   # 调整窗口大小几次
   # Ctrl+C 退出
   # 复制完整输出
   ```

4. **测试结果**:
   ```bash
   pnpm exec vitest run src/commands/shell-resize.test.ts --reporter=verbose
   ```

5. **实际 CLI 截图**: 显示重复渲染的截图

## 快速修复（临时）

如果需要立即缓解问题，可以增加防抖时间：

### 修改 src/commands/shell.ts

找到这一行：
```typescript
unwatchResize = watchTtyResize(handleTerminalResize, { debounceMs: 200 });
```

改为：
```typescript
unwatchResize = watchTtyResize(handleTerminalResize, { debounceMs: 500 });
```

然后重新构建：
```bash
pnpm build
node dist/cli.js
```

这会让调整大小的响应变慢，但会进一步减少重复渲染的可能性。

## 下一步

请运行诊断脚本并分享输出，这样我可以帮您找出具体原因。
