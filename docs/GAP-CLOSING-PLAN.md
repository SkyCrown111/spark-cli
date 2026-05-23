# SparkCLI vs Claude Code — 差距关闭计划

> 排除 IDE 集成，按优先级分阶段实施。
> 每个阶段可独立交付，完成后标记 ✅。

---

## 阶段一：核心体验补齐（最高优先级）

### 1.1 自动加载项目指令文件
- [ ] 支持 `SPARKCLI.md` 项目指令文件（等效 CLAUDE.md）
- [ ] 支持 `SPARKCLI.local.md` 本地指令文件（gitignore）
- [ ] 支持 `~/.spark-cli/SPARKCLI.md` 用户级全局指令
- [ ] 支持 `.spark-cli/rules/*.md` 按路径作用域的规则文件
- [ ] 启动时自动加载并注入系统提示
- [ ] 支持 `@path/to/import` 语法导入其他文件
- [ ] HTML 注释在注入前自动剥离

### 1.2 命名会话
- [ ] `--name / -n` CLI 参数设置会话名称
- [ ] `/rename [name]` 斜杠命令重命名当前会话
- [ ] 会话列表显示自定义名称
- [ ] SessionPicker 显示名称而非纯 ID

### 1.3 对话导出
- [ ] `/export [filename]` 将对话导出为纯文本
- [ ] 包含用户消息、助手回复、工具调用结果
- [ ] 默认文件名：`spark-cli-export-<timestamp>.txt`

### 1.4 会话分支
- [ ] `/branch [name]` 在当前对话节点创建分支
- [ ] 分支继承父对话的完整历史
- [ ] 分支独立保存，互不影响
- [ ] SessionPicker 支持显示分支关系

---

## 阶段二：斜杠命令补齐

### 2.1 代码审查类命令
- [ ] `/code-review [level]` — 审查当前 staged diff 的正确性
  - 支持 `shallow`（快速）和 `deep`（详细）两个级别
  - 输出结构化的问题列表（严重/警告/建议）
- [ ] `/security-review` — 分析待提交变更的安全漏洞
  - 检查 OWASP Top 10
  - 检查硬编码密钥、SQL 注入、XSS 等
- [ ] `/review [PR]` — 在本地审查 Pull Request
  - 加载 PR diff 和评论
  - 逐文件审查并给出总结

### 2.2 代理控制类命令
- [ ] `/goal [condition|clear]` — 设置目标，代理持续工作直到达成
  - 支持条件表达式（如 "tests pass", "build succeeds"）
  - 支持迭代上限防止无限循环
  - `/goal clear` 清除目标
- [ ] `/run` — 启动并驱动应用以验证变更
  - 检测项目类型自动选择启动命令
  - 监控输出确认变更生效
- [ ] `/verify` — 通过构建和运行确认代码变更
  - 自动执行 build + test
  - 报告通过/失败状态
- [ ] `/batch <instruction>` — 大规模并行变更编排
  - 将指令分解为多个独立子任务
  - 并行执行，汇总结果
- [ ] `/btw <question>` — 快速提问，不加入历史
  - 临时上下文查询
  - 不影响主对话流

### 2.3 会话管理类命令
- [ ] `/copy [N]` — 复制最后 N 条助手回复到剪贴板
- [ ] `/context [all]` — 可视化上下文窗口使用情况
  - 彩色网格显示 token 分布
  - 显示各消息占用比例
- [ ] `/add-dir <path>` — 添加额外工作目录
- [ ] `/recap` — 生成单行会话摘要
- [ ] `/sandbox` — 切换沙箱模式（只读/读写）

### 2.4 配置与 UI 类命令
- [ ] `/keybindings` — 打开快捷键配置面板
- [ ] `/focus` — 切换焦点视图（只显示最后一条提示和回复）
- [ ] `/fewer-permission-prompts` — 扫描历史并自动添加允许规则
- [ ] `/debug [description]` — 启用调试日志并排查问题
- [ ] `/feedback [report]` — 提交反馈或报告 bug

---

## 阶段三：键盘快捷键补齐

### 3.1 文本编辑增强
- [ ] `Ctrl+Y` — 粘贴上次删除的文本（yank）
- [ ] `Alt+Y`（在 Ctrl+Y 之后）— 循环粘贴历史（yank ring）
- [ ] `Alt+B` — 光标后移一个单词
- [ ] `Alt+F` — 光标前移一个单词
- [ ] `\` + `Enter` — 快速换行（多行输入）
- [ ] `Ctrl+J` — 替代换行

### 3.2 双击 Esc 功能
- [ ] 第一次 Esc：清除输入草稿
- [ ] 第二次 Esc（300ms 内）：打开回溯菜单
- [ ] 与现有中断功能（代理运行时）不冲突

### 3.3 转录查看器快捷键
- [ ] `?` — 切换快捷键帮助面板
- [ ] `{` / `}` — 跳转到上/下一个用户提示
- [ ] `Ctrl+E` — 切换显示全部内容
- [ ] `[` — 将对话写入回滚缓冲区

---

## 阶段四：权限系统增强

### 4.1 通配符权限规则
- [ ] 支持 `Bash(npm run *)` 格式的通配符匹配
- [ ] 支持 `Read(~/secrets/**)` 路径模式匹配
- [ ] 支持 `WebFetch(domain:example.com)` 域名匹配
- [ ] 支持 `mcp__server__tool` MCP 工具匹配
- [ ] 支持 `Agent(Explore)` 子代理匹配
- [ ] 评估顺序：Deny → Ask → Allow（deny 始终优先）

### 4.2 CLI 权限参数
- [ ] `--permission-mode <mode>` 启动时设置权限模式
- [ ] `--allowedTools <tools>` 预设允许的工具列表
- [ ] `--disallowedTools <tools>` 预设禁止的工具列表
- [ ] `--dangerously-skip-permissions` 跳过所有权限提示

---

## 阶段五：子代理与自定义代理

### 5.1 自定义代理定义
- [x] `.spark-cli/agents/<name>.md` 项目级自定义代理
- [x] `~/.spark-cli/agents/<name>.md` 用户级自定义代理
- [x] 每个代理定义：系统提示、可用工具、上下文模式
- [x] `/agents` 命令列出可用代理
- [x] `--agent <name>` CLI 参数选择代理

### 5.2 子代理增强
- [x] 支持在子代理中运行技能 (`context: fork`)
- [x] 分叉子代理继承父对话上下文
- [x] 子代理持久内存

---

## 阶段六：MCP 功能增强

### 6.1 传输协议
- [x] 支持 HTTP 传输 (streamable-http)
- [ ] 支持 OAuth 2.0 认证
  - 动态客户端注册
  - 预配置凭据
  - 固定回调端口
- [x] 环境变量展开：`${VAR}` 和 `${VAR:-default}`
- [x] 动态请求头 (`headers` field in config)

### 6.2 MCP 高级功能
- [x] MCP 提示作为斜杠命令 (`/mcp__<server>__<prompt>`)
- [ ] MCP 资源引用 (`@server:protocol://resource/path`)
- [ ] 工具搜索（延迟加载 MCP 工具以节省上下文）
- [x] 自动重连（HTTP/SSE 服务器的指数退避）
- [ ] 动态工具更新 (`list_changed` 通知)

### 6.3 REPL 内 MCP 管理
- [x] `/mcp` 斜杠命令（目前只有 CLI 子命令）
- [x] 显示连接状态、工具列表、资源列表
- [x] 支持在 REPL 中添加/移除服务器

---

## 阶段七：技能系统增强

### 7.1 技能功能
- [x] 动态上下文注入：`` !`command` `` 语法
- [x] 字符串替换：`$ARGUMENTS`, `$0`, `$1`, `${SPARK_SESSION_ID}`, `${SPARK_SKILL_DIR}`
- [x] 调用控制：`disable-model-invocation`, `user-invocable`
- [x] `allowed-tools` 预批准工具访问
- [x] 实时变更检测

### 7.2 插件系统增强
- [x] 插件热重载（文件变更自动重新加载）
- [x] 插件钩子集成（插件可注册钩子处理器）
- [x] 插件市场发现机制（本地索引）
- [x] 插件 MCP 服务器绑定

---

## 阶段八：输入体验增强

### 8.1 Vim 模式完善
- [x] VISUAL 模式（字符/行/块选择）
- [x] 文本对象操作（`iw`, `aw`, `i"`, `a(` 等）
- [x] 寄存器支持（`"a`-`"z`）
- [x] 宏录制与回放（`q`/`@`）
- [x] `.` 重复上次操作

### 8.2 提示建议
- [x] 根据 git 历史显示灰色提示建议
- [x] 根据对话上下文生成建议
- [x] Tab 键接受建议

### 8.3 多行输入增强
- [x] `\` + `Enter` 快速换行
- [x] `Option+Enter` macOS 换行
- [x] `Ctrl+J` 替代换行
- [x] 粘贴模式自动检测

---

## 阶段九：杂项功能

### 9.1 会话管理增强
- [x] 跨会话全文搜索
- [x] 会话标签/分类
- [x] 会话自动过期清理

### 9.2 沙箱功能
- [x] 操作系统级别的文件系统隔离
- [x] 网络隔离
- [x] 可配置的允许/禁止路径和域名
- [x] `autoAllowBashIfSandboxed` 沙箱内自动允许 Bash

### 9.3 上下文可视化
- [x] `/context` 彩色网格显示 token 分布
- [x] 各消息占用比例柱状图
- [x] 技能/规则内容存活压缩

### 9.4 CLI 增强
- [x] `--bare` 最小模式（跳过自动发现钩子/技能/插件/MCP）
- [x] `--fallback-model` 自动回退模型
- [x] `--tools <tools>` 限制可用内置工具
- [x] `--output-format text|json|stream-json`
- [x] `--add-dir` 添加额外工作目录
- [x] `project purge` 删除项目所有 SparkCLI 状态

### 9.5 低优先级功能
- [x] ~~语音输入（按住/点击空格录音）~~ — 用户明确不需要
- [x] 输出风格/角色自定义
- [ ] Jupyter Notebook 编辑工具
- [ ] LSP 代码智能集成
- [ ] 推送通知
- [x] 定时唤醒工具

---

## 实施建议

| 阶段 | 预计工作量 | 建议顺序 |
|---|---|---|
| 阶段一：核心体验 | 2-3 周 | 立即开始 |
| 阶段二：斜杠命令 | 2-3 周 | 阶段一完成后 |
| 阶段三：键盘快捷键 | 3-5 天 | 与阶段二并行 |
| 阶段四：权限系统 | 1-2 周 | 阶段二完成后 |
| 阶段五：子代理 | 1-2 周 | 阶段四完成后 |
| 阶段六：MCP | 2-3 周 | 阶段五完成后 |
| 阶段七：技能系统 | 1-2 周 | 与阶段六并行 |
| 阶段八：输入体验 | 1-2 周 | 阶段七完成后 |
| 阶段九：杂项 | 持续 | 按需排期 |

**总计预估：12-18 周（3-4.5 个月）**
