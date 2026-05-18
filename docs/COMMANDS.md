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
| `/help`, `/exit` | Help or quit |

Flags: `spark-cli --auto` starts in direct-write mode. `spark-cli chat --legacy` uses the old fenced-block codegen pipeline.

**REPL UX**: Claude Code–style panel — two-column welcome (`│` divider), gray user bars (`> message`), `└` assistant replies, `· Sparking…` status, `esc to interrupt` footer, Shift+Tab mode line. `spark-cli --no-mascot` hides the mascot.

**Vision in agent mode**: `spark-cli ui --agent --image design.png "build this HUD"` uses the vision model when configured.

One-shot: `spark-cli chat "…"` runs a single agent turn. `spark-cli gen --agent` / `spark-cli ui --agent` prefer the agent over legacy codegen.

## Config

| Command | Description |
|---------|-------------|
| `spark-cli config init` | Interactive wizard (`~/.spark-cli/config.yaml` or project) |
| `spark-cli config show` | Print global config path and default model |

Custom provider keys: use `api_key` in YAML **or** `key_env: MIMO_API_KEY` plus `$env:MIMO_API_KEY` (not the token in `key_env`).

## Agent tools (REPL / `chat`)

Built-ins: `read_file`, `write_file`, `edit_file`, `bash`, `grep`, `glob`, `list_dir`, `task`, `load_skill`, `remember`, `recall`.

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
| `spark-cli doctor` | Node, config, engine, API keys |
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

## Quality (Phase 8)

| Command | Description |
|---------|-------------|
| `spark-cli replay export [file]` | Export `replay.json` |
| `spark-cli plugin list\|install\|uninstall` | Local plugins in `.spark-cli/plugins/` |

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

## Phase docs

Detailed acceptance per phase: `docs/PHASE-1.md` … `docs/PHASE-12.md`. See [CHANGELOG.md](../CHANGELOG.md) for release notes.
