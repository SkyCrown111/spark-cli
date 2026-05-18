# Phase 13 — Claude Code 完整对齐

> 目标：把 Phase 12 没收掉的 10 项差距全部闭环，让 SparkCLI 的 agent 工具面、记忆体系、隔离与定时、自检指令、文档与版本号都与 Claude Code 对齐。完成后切版本 **0.2.0** 并标 BREAKING。

## Status

| Item | Status |
|------|--------|
| 1. 删除 legacy codegen 与 `chat --legacy` | ✅ |
| 2. `ask_user_question` agent 工具 | ✅ |
| 3. 后台任务工具组 `bash_background` / `task_output` / `task_stop` | ✅ |
| 4. `web_fetch` / `web_search` 工具 | ✅ |
| 5. Todo 工具组（`todo_create` / `todo_update` / `todo_list` / `todo_get`） | ✅ |
| 6. 跨会话持久 memory（分类 + `MEMORY.md` 索引） | ✅ |
| 7. `spark-cli worktree` + `spark-cli cron`（EnterWorktree / CronCreate 等价） | ✅ |
| 8. Unity 场景图 MCP writer（移除 PHASE-12 "Out of scope"） | ✅ |
| 9. `spark-cli doctor` 暴露 agent 对齐差距 | ✅ |
| 10. ROADMAP / README / PHASE-12 三处状态统一 + 版本切 0.2.0 | ✅ |

## 设计原则

- **功能对齐，不抠命名**：目标是每项能力 SparkCLI 都能做到——agent 能问问题、能跑后台命令、能联网、能管 todo、能持久记忆、能开 worktree、能定时跑。工具名沿用 SparkCLI 现有 snake_case 风格（不强行复刻 Claude Code 的 `TaskCreate`/`AskUserQuestion` 这种 PascalCase）。`task` 子代理工具不改名，新增的 todo 工具用 `todo_*` 前缀避免冲突。
- **不破坏 staging 不变量**：所有新写工具默认走 `.spark-cli/staging/`，后台 bash 的工作目录都受限于 `projectRoot`。
- **REPL 优先，CLI 次选**：每个新能力优先在 REPL 中可用（slash 命令 / 工具调用 / 可视回执），只有真正需要脱离 REPL 的能力才加 `spark-cli` 子命令（worktree、cron 算这一类）。
- **无新 Phase 文件**：Phase 13 完成后进入"维护期"，不再追加 PHASE-N 文档。

## Deliverables

### 1. 删除 legacy codegen（BREAKING）

- 删除：
  - `src/core/llm/generate.ts`
  - `src/core/llm/interactive-turn.ts`
  - `src/core/llm/extract-code.ts` + `extract-code.test.ts`
  - `src/core/llm/prompt-builder.ts`（如仅服务于 legacy）
  - `src/commands/chat.ts` 中 `chatOpts.legacy` 分支与 `runGenerate` 调用
  - 所有 `runGenerate` 引用的 `gen` / `ui` / `level` / `anim` legacy 路径
- CLI 表面：`chat` 不再接受 `--legacy` 标志（移除 commander 选项注册）。
- CHANGELOG 标 **BREAKING**；package.json 版本 `0.1.0` → `0.2.0`。
- 测试：删除 legacy 相关测试用例；新增一项验证 `chat --legacy` 报未知选项。

### 2. `ask_user_question` 工具

- 新文件：`src/core/agent/tools/ask-user-question.ts`
- 入参（JSON Schema）：
  ```json
  {
    "questions": [{
      "question": "string",
      "header": "string (max 12 chars)",
      "options": [{ "label": "string", "description": "string" }],
      "multiSelect": "boolean"
    }]
  }
  ```
- REPL 中通过 readline 渲染卡片（标签 + 描述 + 数字选择）；非 REPL（一次性 `chat`）下报 `unsupported_in_oneshot`。
- 工具结果回到模型形如 `{ answers: { "<question>": "<label>" } }`。
- 必须同时进入 `tool-permissions.ts` 的 `sensitive=false` 白名单，但仍计入 hooks `pre_tool` / `post_tool`。

### 3. 后台任务工具组

- 新文件：`src/core/agent/tools/bash-background.ts`、`task-output.ts`、`task-stop.ts`、`src/core/agent/background-tasks.ts`（管理器）。
- `BackgroundTaskManager`：进程级单例（per agent session），登记 `taskId → { child, stdout/stderr buffer, status, startedAt }`，支持 `read(taskId, { offset, limit })` 与 `stop(taskId)`。
- `bash_background`：等价于 `bash` 但立即返回 `taskId`，stdout/stderr 增量写入内存缓冲（环形上限 1 MB），进程退出后状态保留 1 小时。
- 所有后台任务在 REPL 退出 / `session_end` 钩子时强制 kill。
- `bash` 工具描述更新："长跑命令请使用 `bash_background`"。

### 4. `web_fetch` / `web_search`

- 新文件：`src/core/agent/tools/web.ts`。
- `web_fetch`：`undici.fetch` + 15 分钟内存缓存 + HTML→纯文本（首选 `linkedom`，避免新增重型依赖；若不引入新依赖则用 `unified`/简单正则脱标签）。配置项 `tools.web.maxBytes`（默认 256 KB）。
- `web_search`：默认走环境变量 `BRAVE_SEARCH_API_KEY` 或 `TAVILY_API_KEY`。无 key 时返回 "未配置搜索 provider"，并在 doctor 标注。
- 安全：默认禁用 file/ftp scheme；URL 必须 https/http；超时 15 s。
- Plan 模式：两者均允许（read-only）。

### 5. Todo 工具组

- 新文件：`src/core/agent/todo-store.ts`、`src/core/agent/tools/todo.ts`。
- 工具名：`todo_create` / `todo_update` / `todo_list` / `todo_get`（避开已有的 `task` 子代理工具）。
- 存储：进程内 `Map<id, Todo>`，REPL 退出即清；可选 `--persist` 时落 `.spark-cli/todos.json`。
- 字段：`id` / `subject` / `description` / `activeForm` / `status (pending|in_progress|completed)` / `blockedBy[]`。
- REPL 渲染：每次 `todo_update` 后在状态条下面打印 `[ ]` / `[~]` / `[x]` 列表，效果对齐 Claude Code 的可视看板。

### 6. 跨会话持久 memory

- 新目录：`~/.spark-cli/projects/<slug>/memory/`，`<slug>` 用 `projectRoot` 的哈希前 12 位避免大小写差异。
- 类型：`user` / `feedback` / `project` / `reference`，与 Claude Code 一致；每条单文件 + frontmatter（`name` / `description` / `type`）。
- 索引：同目录下 `MEMORY.md`，纯指针行，前 200 行加载到 system prompt。
- 改造：
  - `src/core/memory/store.ts` 新增 `loadCrossSessionMemory(projectRoot)` 与 `writeMemoryFile(...)`。
  - `system-prompt.ts` 在 `formatMemoryForPrompt` 之后追加 `MEMORY.md` 索引节段。
  - 老的 `.spark-cli/memory/{session,project}.json` 保留（运行期可读），新写一律去新位置；首次加载时打一次 deprecation log。
- CLI：`spark-cli memory list|show|forget`（替代旧 `add|clear`，旧子命令保留并标 deprecated 一个版本）。
- 工具：`remember` / `recall` 改为读写新存储。

### 7. `spark-cli worktree` + `spark-cli cron`

- `worktree`：
  - 命令：`spark-cli worktree create [name]` / `worktree exit --keep|--remove [--discard-changes]` / `worktree list`。
  - 实现：调用 `git worktree add .spark-cli/worktrees/<name> -b spark-cli/<name>`；若不在 git 仓库则报错（不实现非 git fallback）。
  - 进入后切换 REPL 的 `projectRoot`（清 `contextCache`、重新加载 hooks/skills）。
- `cron`：
  - 命令：`spark-cli cron create <expr> <prompt> [--once]` / `cron list` / `cron delete <id>`。
  - 实现：`node-cron` 或自写 5-field 解析；只在 REPL idle 时 fire；jitter ≤ 10% 周期，单次 ≤ 90 s。
  - 存储：默认进程内；`--durable` 落 `.spark-cli/scheduled_tasks.json`，REPL 启动时恢复。
- 两者都加 `spark-cli doctor` 自检（git 是否可用、cron 任务数、是否有 stale 的 worktree）。

### 8. Unity 场景图 MCP writer

- 移除 PHASE-12 的 `Out of scope`。
- 新文件：`src/engines/unity/scene-graph.ts`（解析 `.unity` YAML） + `src/mcp/tools.ts` 注册 `unity_scene_set_property` / `unity_scene_add_component`。
- 写入仍走 staging（`write-guard.ts` 检查路径在 staging 范围内）。
- 测试：`fixtures/unity-mini` 的最小 `.unity` 文件 + 设置组件值的快照。

### 9. `spark-cli doctor` 暴露差距

- 新检查项：
  - `agent_tools`：注册的工具数（含 MCP 适配），列出与 Claude Code 标准工具的对照（缺哪个）。
  - `skills`：扫描 `.spark-cli/skills/`、`~/.spark-cli/skills/` 与 bundled。
  - `hooks`：列已配置 hook 数与事件覆盖。
  - `memory`：跨会话 memory 路径是否存在、`MEMORY.md` 行数。
  - `worktree`：`git worktree list` 中 `.spark-cli/worktrees/*` 是否有遗留。
  - `cron`：当前活跃任务数。
  - `web`：`BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` 是否设置。
- `--json` 输出新增 `parity` 节点：
  ```json
  { "parity": { "claudeCodeTools": ["read_file", "..."], "missing": [], "extra": [] } }
  ```

### 10. 文档与版本统一

- `ROADMAP.md`：表格新增第 12、13 行；删除"代码与 Phase 错位说明"中已经过期的部分；状态行更新为 `2026-05` → 当前月份。
- `README.md`：开发阶段一览表新增 Phase 13；Quick start 段加上"Background tasks / Web tools / Worktree / Cron"小节。
- `PHASE-12.md`：把 ⏳ 项标 ✅（legacy 删除接管），移除"Out of scope" Unity 场景图条目。
- `CHANGELOG.md`：新增 `## [0.2.0] — <date>`，BREAKING 行列出删除的 legacy CLI 标志与文件路径。
- `docs/COMMANDS.md`：补 `worktree`、`cron`、`memory`（新格式）、`doctor` 新检查项。

## 验收脚本

新增 `scripts/phase13-accept.mjs`：

```js
// 检查项（一定不放过）：
// - typecheck / unit tests / build 通过
// - chat --legacy 报未知选项（assert exit code != 0）
// - doctor --json 含 parity.claudeCodeTools，missing 为空数组
// - bash_background + task_output 的 e2e（agent mocked）
// - web_fetch 命中本地 fixture HTTP server，缓存命中第二次
// - todo 工具的 e2e（todo_create → todo_update → todo_list）
// - 跨会话 memory 写入后第二次 REPL 启动能读到 MEMORY.md 行
// - worktree create/exit 在 fixtures/cocos-3.8-mini 上无残留
// - cron 5-field 解析单元测试
// - PHASE-12.md 不再含 ⏳；README/ROADMAP 含 Phase 13 ✅ 行
```

`pnpm test:phase13` 加入 package.json scripts。

## Acceptance

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:phase13

spark-cli doctor --json | jq '.parity.missing | length'   # → 0
spark-cli --help | grep -E '(worktree|cron)'              # 命中
node dist/cli.js chat --legacy "x"                      # 报错
```

完成上述全部条目后，将本表 `Status` 列全部 ✅，并在 README "开发阶段一览" 中把 Phase 13 标 ✅。

## Out of scope（保留延期）

- Live LLM 网络集成测试（依旧由 mocked agent 覆盖）
- 真实 SparkCLI Cloud 后端（保留 mock）
- Web 工具的搜索 provider 自适应（仅支持 Brave / Tavily 两家）
- 非 git 仓库的 worktree fallback（直接报错）
