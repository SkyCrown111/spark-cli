# SparkCLI command reference

Global flags (all commands): `-P, --project`, `--json`, `--verbose`, `-y, --yes`, `--dry-run`, `--provider`, `-m, --model`

## Interactive (Claude Code–style)

Running **`spark-cli`** with no subcommand starts an **agent REPL** (same as `spark-cli shell` or `spark-cli chat` with no prompt).

| Input | Action |
|-------|--------|
| Plain text | ReAct agent turn (tools + streaming reply) |
| `@src/foo.ts`, `@assets/` | Attach file contents or directory listing to the turn |
| `/gen [type] …` | Agent task: generate code (`component` / `system` optional) |
| `/ui …` | Agent task: UI generation |
| `/level <name> [hint]` | Agent task: level data |
| `/anim <name> [spec]` | Agent task: animation / state machine |
| `/plan`, `/exit-plan [y]` | Read-only plan mode, then approve |
| `/auto [on\|off]` | Toggle staging vs direct writes |
| `/diff`, `/apply`, `/revert` | Staging workflow |
| `/clear`, `/compact`, `/status` | History / tokens |
| `/doctor`, `/validate`, `/init` | Project commands |
| `/model`, `/model list`, `/model use <p/m>` | Model management |
| `/skills`, `/hooks`, `/memory`, `/replay` | Session utilities |
| `/tag add\|remove <tags>` | Session tags |
| `/search <query>` | Cross-session search |
| `/cleanup [--delete]` | Clean up old sessions |
| `/context [all]` | Token distribution visualization |
| `/wakeup <delay> <msg>` | Schedule a wake-up reminder |
| `/style <style>` | Set output style |
| `/help`, `/exit` | Help or quit |
| `/tui default\|fullscreen` | Persist renderer preference (restart to apply) |

**Renderer** (Claude Code–aligned):

| Mode | Behavior |
|------|----------|
| `default` (default) | Main terminal buffer; session output stays in native scrollback. Use the terminal's scroll wheel, Cmd+F, or tmux copy mode to review. |
| `fullscreen` (opt-in) | Alternate screen via Ink; input fixed at bottom; scroll/search/copy in-app. |

Enable fullscreen: `spark-cli --fullscreen`, `spark-cli --renderer fullscreen`, `/tui fullscreen`, `ui.renderer: fullscreen` in `~/.spark/settings.json`, or `SPARK_CLI_NO_FLICKER=1`.

Force default: `spark-cli --renderer default`, `/tui default`, or `SPARK_CLI_DISABLE_ALTERNATE_SCREEN=1`.

Priority: CLI flags > persisted `ui.renderer` > environment variables > `default`.

Deprecated aliases: `--ink` / `--no-ink` (use `--fullscreen` / `--renderer default`).

Flags: `spark-cli --auto` starts in direct-write mode.

**Global flags**:
- `--bare` — minimal mode: skip auto-discovery of hooks/skills/plugins/MCP
- `--fallback-model <model>` — auto-fallback model if primary fails
- `--tools <tools>` — comma-separated list of available built-in tools
- `--output-format <format>` — output format: text|json|stream-json
- `--add-dir <path>` — add extra working directory (can be repeated)

**REPL UX**: Default renderer uses the main terminal buffer (native scrollback). Fullscreen renderer (`--fullscreen` or `--renderer fullscreen`) uses Ink — scrollable messages, inline permission dialogs, streaming responses, Shift+Tab mode cycling, status line with model/tokens/hints. `spark-cli --no-mascot` hides the mascot.

**Input features**:
- **Multi-line**: `Shift+Enter` or `Option+Enter` (macOS) for newline, `\` + `Enter` quick newline, `Ctrl+J` alternative newline
- **Paste mode**: Auto-detects multi-line pastes and inserts them correctly
- **Git suggestions**: Shows gray hint suggestions based on recent git commits when input is empty
- **Vim mode**: `--vim` flag enables NORMAL/INSERT/VISUAL/VISUAL LINE modes with registers (`"a`-`"z`), macros (`q`/`@`), text objects (`iw`, `aw`, `i"`, `a(`), and `.` repeat

**Vision in agent mode**: `spark-cli ui --agent --image design.png "build this HUD"` uses the vision model when configured.

One-shot: `spark-cli chat "…"` runs a single agent turn. `spark-cli gen --agent` / `spark-cli ui --agent` prefer the agent over legacy codegen.

## Config

| Command | Description |
|---------|-------------|
| `spark-cli config init` | Interactive wizard (`~/.spark-cli/config.yaml` or project) |
| `spark-cli config show` | Print global config path and default model |

## Skills (agent playbooks)

Skills are markdown playbooks with YAML-ish frontmatter, loaded from (lowest → highest precedence; later wins on duplicate **`name`**):

1. Bundled with the CLI (`dist/skills/` in release builds; repo `skills/` in dev)
2. `~/.spark-cli/skills/<name>/SKILL.md`
3. `<project>/.spark-cli/skills/<name>/SKILL.md`

| Command | Description |
|---------|-------------|
| `spark-cli skills list` | List all loaded skills (`--json` supported) |
| `spark-cli skills validate` | Check `triggerPattern`, `allowedTools`, shadowing; exit `2` on errors |
| `spark-cli skills init <name>` | Create `.spark-cli/skills/<name>/SKILL.md` from a template (`--force` overwrite) |
| `/skills` | List installed skills in REPL |
| `/skill <name> [args]` | Load and execute a skill as a prompt |

Frontmatter: **`name`**, **`description`**, **`triggers`** (substring list), **`triggerPattern`** (regex, e.g. `/foo/i`), **`allowedTools`** (widens plan/MCP gates after **`load_skill`**), **`disableModelInvocation`** (model cannot load this skill), **`userInvocable`** (set false to make model-only). The system prompt includes **Skills (index)** when skills exist; matching triggers may auto-inline the body (byte cap).

**Skill body features**: `` !`command` `` inline command execution, `$ARGUMENTS` / `$0` / `$1` positional args, `${SPARK_SESSION_ID}`, `${SPARK_SKILL_DIR}`, `${SPARK_PROJECT_ROOT}` variable substitution.

Custom provider keys: use `api_key` in YAML **or** `key_env: MIMO_API_KEY` plus `$env:MIMO_API_KEY` (not the token in `key_env`).

## Custom Agents

Agents are markdown definitions with YAML-ish frontmatter, loaded from (lowest → highest precedence; later wins on duplicate **`name`**):

1. `~/.spark-cli/agents/<name>/AGENT.md`
2. `<project>/.spark-cli/agents/<name>/AGENT.md`

| Command | Description |
|---------|-------------|
| `/agents` | List all available custom agents |
| `/agents use <name>` | Activate a custom agent for this session |
| `/agents off` | Deactivate custom agent (use default) |
| `spark-cli --agent <name>` | Start with a specific agent active |

Frontmatter: **`name`**, **`description`**, **`allowedTools`** (restricts agent to these tools only), **`contextMode`** (`inherit` / `fresh` / `fork`). The markdown body becomes the system prompt extension for that agent.

## Agent tools (REPL / `chat`)

Built-ins: `read_file`, `write_file`, `edit_file`, `bash`, `grep`, `glob`, `list_dir`, `task`, `load_skill`, `remember`, `recall`.

Optional `spark-cli.config.yaml`: `agent.maxIterations`, `agent.toolDispatchConcurrency` (max parallel tool calls per provider round; default 3). `subagent.model` uses a different model for `task`-spawned sub-agents (`provider/model` or a model id with the task’s inherited provider); invalid values fail fast at spawn. `subagent.concurrency` is a deprecated alias for `agent.toolDispatchConcurrency` when the latter is unset. `tools.gen.image` (`enabled`, `provider: mock|openai|stability`) and `tools.gen.audio` (`enabled`, `provider: mock|elevenlabs`) — OpenAI images uses the Images API when enabled; Stability/ElevenLabs return explicit errors until implemented.

Engine / editor (when applicable):

| Tool | Engine |
|------|--------|
| `scene_list`, `scene_analyze`, `scene_add_node`, `component_update` | Cocos (+ MCP) |
| `tscn_list`, `tscn_analyze` | Godot (+ MCP) |
| `unreal_project_info` | Unreal (+ MCP) |
| `stage_project_file` | Godot, Unreal, Unity (MCP; needs `mcp.allowWrite`) |
| `editor_scene_open`, `editor_selection_get` | Cocos (Editor Bridge extension) |
| `validate_project` | All |

## Core

| Command | Description |
|---------|-------------|
| `spark-cli init` | Create `spark-cli.config.yaml`, `.spark-cli/` |
| `spark-cli doctor` | Node, config, engine, API keys; `--json` adds `parity.capabilities` (image/audio gen, cpp index, assets audit backend, optional packages). Editor Bridge: [BRIDGE.md](./BRIDGE.md) |
| `spark-cli validate` | `tsc` or `dotnet build`, scene integrity (Cocos) |

## Model

| Command | Description |
|---------|-------------|
| `spark-cli model list` | Providers and example models |
| `spark-cli model use <provider>/<model>` | Set default model |
| `spark-cli model current` | Show default |
| `spark-cli model test` | Ping LLM |

## Generate & staging

| Command | Description |
|---------|-------------|
| `spark-cli` / `spark-cli shell` | Interactive session (default) |
| `spark-cli chat [prompt]` | Interactive if no prompt; else LLM → staging |
| `spark-cli gen [prompt]` | `--type component\|system`; `--agent` for tool loop |
| `spark-cli ui [prompt]` | UI codegen; `--image`, `--figma`, `--sketch`; `--agent` |
| `spark-cli diff` | Show staged diff |
| `spark-cli apply` | Apply staging to project |
| `spark-cli revert` | Clear staging |

## Scene (Cocos)

| Command | Description |
|---------|-------------|
| `spark-cli scene list` | List `.scene` files |
| `spark-cli scene analyze <path>` | Node tree |
| `spark-cli scene optimize <path>` | Static tips |
| `spark-cli scene open <path>` | Editor Bridge (Cocos extension) |

## Knowledge & memory

| Command | Description |
|---------|-------------|
| `spark-cli knowledge index\|search\|add` | Local BM25 knowledge |
| `spark-cli memory show\|add\|clear` | Project/session memory |

## WeChat & assets (Phase 4)

| Command | Description |
|---------|-------------|
| `spark-cli build wechat\|analyze\|suggest-split` | See [wechat.md](./wechat.md) |
| `spark-cli adapt wechat` | Compliance report |
| `spark-cli publish wechat --env preview` | DevTools upload |
| `spark-cli asset list\|analyze\|unused\|import` | Asset utilities |

## Multi-platform (Phase 5)

| Command | Description |
|---------|-------------|
| `spark-cli adapt douyin\|alipay\|huawei` | See [platforms.md](./platforms.md) |
| `spark-cli publish <platform> --dry-run` | Publish CLI skeleton |

## MCP (Phase 3)

| Command | Description |
|---------|-------------|
| `spark-cli mcp serve` | stdio MCP server — [mcp.md](./mcp.md) |
| `spark-cli mcp add <name>` | Add an MCP server to config (`--transport stdio|sse|http`, `--command`, `--url`, `--env`, `--global`) |
| `spark-cli mcp list` | List configured MCP servers |
| `spark-cli mcp remove <name>` | Remove an MCP server from config |
| `spark-cli mcp test <name>` | Test connectivity to an MCP server |
| `/mcp` | Show MCP server status in REPL |
| `/mcp tools` | List all discovered MCP tools |
| `/mcp add <name> <cmd> [args]` | Quick-add a stdio MCP server |
| `/mcp remove <name>` | Remove an MCP server |
| `/mcp test <name>` | Test MCP server connectivity |

MCP config supports: `stdio`/`sse`/`http` transports, `${VAR}` and `${VAR:-default}` env var expansion in `command`/`url`/`env`/`headers`, and `headers` field for custom HTTP headers. Auto-reconnect with exponential backoff for HTTP/SSE servers.

## Quality (Phase 8)

| Command | Description |
|---------|-------------|
| `spark-cli replay export [file]` | Export `replay.json` |
| `spark-cli plugin list\|install\|uninstall` | Local plugins in `.spark-cli/plugins/` |
| `spark-cli playtest record [scene]` | Create playtest session file |
| `spark-cli playtest replay <file>` | Replay a recorded playtest session |
| `spark-cli playtest compare <a> <b>` | Compare two playtest sessions |
| `spark-cli profile capture` | Plan engine profile capture |
| `spark-cli profile analyze <file>` | Analyze captured profile data |
| `spark-cli profile budget` | Show/generate performance budget |

Plugins support: **hook integration** (define `hooks` in manifest to handle events), **MCP server binding** (define `mcpServers` in manifest to provide MCP tools), **hot-reload** (file watcher detects changes), **marketplace discovery** (local index at `~/.spark-cli/plugin-index.json`).

## Unreal & Godot (Phase 10)

| Command | Description |
|---------|-------------|
| `spark-cli init --engine unreal\|godot` | Set engine in config |
| `spark-cli gen [prompt]` | Template gen for unreal/godot (LLM for cocos/unity) |
| `spark-cli build godot --platform web` | Plan Godot export command |
| `spark-cli build unreal --target Development` | Plan UnrealBuildTool command |
| MCP `tscn_list` / `tscn_analyze` | Godot projects only |
| MCP `unreal_project_info` | Unreal projects only |

## Level & anim (Phase 9)

| Command | Description |
|---------|-------------|
| `spark-cli level new <name> [hint]` | Level JSON + Cocos loader → staging |
| `spark-cli level edit <path> [hint]` | Rule-based level patch → staging |
| `spark-cli level show <path>` | Print level summary |
| `spark-cli anim new <name> [spec]` | State machine JSON + controller → staging |
| `spark-cli anim export <path>` | `--format cocos` runtime bundle |
| `spark-cli anim show <path>` | Print anim graph summary |
| `spark-cli editor serve` | Web UI on `localhost:17323` (staging sync API) |

## Cloud (Phase 11)

| Command | Description |
|---------|-------------|
| `spark-cli cloud serve` | Local mock Cloud API (dev) |
| `spark-cli cloud login [--yes]` | Device-code login |
| `spark-cli cloud logout` | Clear session |
| `spark-cli cloud status` | Login / proxy status |
| `spark-cli cloud keys set <provider> --key …` | Store key in cloud |
| `spark-cli cloud keys list` | List stored providers |
| `spark-cli cloud keys use` / `keys off` | Enable/disable LLM proxy |
| `spark-cli cloud push` / `pull` | Sync whitelisted paths |

Set `SPARK_CLI_CLOUD_ENDPOINT` for non-default API URL.

## Agent workflows

| Command | Description |
|---------|-------------|
| `spark-cli agent farm <plan>` | Run parallel sub-agents from a YAML plan |
| `spark-cli agents list` | List background agents and agent definitions |
| `spark-cli agents attach <id>` | Attach to a background agent (show its output) |
| `spark-cli agents logs <id>` | Show agent logs |
| `spark-cli agents kill <id>` | Kill a running background agent |

## Sessions

| Command | Description |
|---------|-------------|
| `spark-cli sessions list` | List all sessions for this project |
| `spark-cli sessions show <id>` | Show session details and history |
| `spark-cli sessions delete <id>` | Delete a saved session |

## Worktrees

| Command | Description |
|---------|-------------|
| `spark-cli worktree list` | List worktrees managed by spark-cli |
| `spark-cli worktree add [name]` | Create a new worktree for isolated work |
| `spark-cli worktree remove <name>` | Remove a worktree |

## Cron

| Command | Description |
|---------|-------------|
| `spark-cli cron list` | List scheduled cron jobs |
| `spark-cli cron add <schedule> <prompt>` | Add a recurring cron job |
| `spark-cli cron remove <id>` | Remove a cron job |
| `spark-cli cron tick` | Manually trigger pending cron jobs |

## Shaders

| Command | Description |
|---------|-------------|
| `spark-cli shader lint` | Lint project shaders for issues |
| `spark-cli shader translate <file>` | Translate shaders between languages |

## Project utilities

| Command | Description |
|---------|-------------|
| `spark-cli project info` | Show project metadata and detected engine |
| `spark-cli project scan` | Scan project structure and assets |

## Phase docs

Detailed acceptance per phase: `docs/PHASE-1.md` … `docs/PHASE-12.md`. See [CHANGELOG.md](../CHANGELOG.md) for release notes.
