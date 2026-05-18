# Changelog

All notable changes to SparkCLI are documented here.

## [Unreleased]

## [0.3.0-dev] — Phase 14: Game-dev depth (items 6–15)

### Added (Phase 14 #6–15)

- **Validate**: `perf_lint` + `platform_matrix`; `spark-cli validate --perf`, `spark-cli adapt matrix`.
- **Shader**: `shader_lint`, `shader_translate`, `material_audit`; `spark-cli shader lint|translate`.
- **Profile**: `profile_capture`, `profile_analyze`, `frame_budget_check`; `spark-cli profile capture|analyze|budget`.
- **Art**: `atlas_pack`, `spine_import`, `dragonbones_import`, `lottie_import`.
- **Gameplay**: `tilemap_import`, `balance_convert`, `balance_diff`, `difficulty_suggest`.
- **QA**: `playtest_record`, `playtest_replay`, `playtest_compare`; `spark-cli playtest record|replay|compare`.
- **Workflow**: staging `locks.json`, `lock_status`, `farm_run`; `spark-cli agent farm <plan.yaml>`.
- **Bridge**: Cocos bridge `playmode.start/stop`, `console.tail`; Unity/Unreal package stubs.
- **MCP**: `src/mcp/engine-tools.ts` + doctor `engineMcp` parity section.
- **Gen**: `asset_generate_image`, `asset_generate_audio`; `spark-cli asset generate-icon`; `tools.gen.*` config.

## [0.3.0-dev] — Phase 14: Game-dev depth (in progress)

> Feature jump, **no BREAKING**. See [docs/PHASE-14.md](./docs/PHASE-14.md) for the
> 15-item delivery table. Items flip from ⏳ to ✅ as they land; `pnpm test:phase14`
> tracks progress.

### Added

- **REPL chrome** matched to Claude Code: compact welcome card (`✻ Welcome to SparkCLI!`),
  bare `>` prompt, mode hint rendered **under** the input frame with `⏵⏵` arrows,
  Shift+Tab cycles `staging → auto-accept → plan`. Model now lives in the welcome
  card and `/status`, not on the per-prompt status bar.
- **`scripts/phase14-accept.mjs`** + `pnpm test:phase14` — baseline (typecheck/test/build,
  doc presence, version, parity-tools floor) plus per-item gated checks that flip on as
  deliverables land.

## [0.2.0] — 2026-05-18 — Phase 13: Claude Code parity (BREAKING)

### Breaking

- **Removed legacy codegen pipeline.** `src/core/llm/` is gone. `spark-cli chat`,
  `spark-cli gen`, and `spark-cli ui` always use the ReAct agent loop now. The
  `--legacy` and `--agent` flags have been removed.

### Added

- **`ask_user_question` agent tool** + REPL prompter — agents can pose
  multiple-choice questions and wait for the answer.
- **Background tasks**: `bash_background`, `task_output`, `task_stop` agent
  tools backed by a 1 MB ring buffer per stream. `session_end` cleans up.
- **Web access**: `web_fetch` and `web_search` (DuckDuckGo HTML backend).
  Disabled by default — opt in via `tools.web.enabled`.
- **Todo tools**: `todo_create`, `todo_list`, `todo_get`, `todo_update` for
  per-session task tracking with dependency edges.
- **Cross-session memory**: file-based `~/.spark-cli/projects/<slug>/memory/`
  with `MEMORY.md` index and `memory_save` / `memory_search` / `memory_list` /
  `memory_delete` tools. Categories: user, feedback, project, reference.
- **`spark-cli worktree` + `spark-cli cron`** subcommands. Worktrees live under
  `.spark-cli/worktrees/`; cron jobs persist to `~/.spark-cli/cron.json`.
- **Unity scene-graph MCP writer**: `unity_scene_list`, `unity_scene_analyze`,
  `unity_scene_set_property`, `unity_scene_add_component` (staged writes).
- **`spark-cli doctor` parity block** (and `--json` `parity` node) listing tools,
  skills, hooks, memory, worktrees, cron jobs, and web access state.

### Added (carried from previous Unreleased section)

- **Gemi mascot**: signature REPL companion on startup, wave goodbye, and `Gemi is thinking…` during turns (`--no-mascot` or `SPARK_CLI_NO_MASCOT=1` to disable).
- **Claude-style REPL chrome**: bordered welcome card and input frame with `❯` prompt.
- **REPL `@path` references**: attach file or directory context inline (Claude Code–style `@` mentions).
- **REPL Tab completion** for `/slash` commands and a **status bar** (model, write mode, project).
- **Sensitive tool prompts** in the REPL: `bash`, `write_file`, `edit_file`, MCP writes ask `[y/n/a=always]`.
- **Inline diff preview** after staged tool writes (no need to run `/diff` first).
- **`spark-cli ui --agent --image|--figma|--sketch`**: agent loop with vision/design input.
- **Claude Code–style REPL**: `spark-cli` with no subcommand starts an interactive agent session (`spark-cli shell`, `spark-cli chat` with no prompt).
- **ReAct agent loop** for `chat` and the REPL: tools (`read_file`, `write_file`, `edit_file`, `bash`, `grep`, `glob`, `list_dir`, `task`, skills, memory, MCP-adapted engine tools).
- Slash commands: `/plan`, `/exit-plan`, `/auto`, `/compact`, `/status`, `/skills`, `/hooks`, `/memory`, `/replay`, `/refresh`, plus staging (`/diff`, `/apply`, `/revert`).
- **`spark-cli config init`**: interactive wizard for `~/.spark-cli/config.yaml` (provider, model, custom OpenAI-compatible endpoints).
- **Editor Bridge agent tools** (Cocos): `editor_scene_open`, `editor_selection_get` when the bridge extension is running.
- **MCP write tools** for Godot/Unreal/Unity: `stage_project_file` (staged writes; requires `mcp.allowWrite: true`).
- REPL shortcuts `/gen`, `/ui`, `/level`, `/anim` route prompts through the agent loop.
- `spark-cli gen --agent` and `spark-cli ui --agent` use the agent loop instead of legacy codegen.

### Fixed

- Global config no longer overridden by empty project defaults when no `spark-cli.config.yaml` exists.
- Custom provider `key_env` vs `api_key` validation and clearer doctor messages.
- Model IDs normalized to lowercase for OpenAI-compatible gateways (e.g. MiMo `mimo-v2.5-pro`).

### Deprecated

- `spark-cli chat --legacy` — fenced-block codegen pipeline; removal planned next major.

## [0.1.0] — 2026-05

- Phases 1–11: CLI core, staging, MCP, multi-platform, Unity, vision, replay/plugins, level/anim/editor, Unreal/Godot, Cloud mock.
