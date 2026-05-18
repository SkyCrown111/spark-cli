# Phase 12 — Claude Code parity & agent UX

> Post–Phase 11 polish: interactive agent, config wizard, docs, and engine tool coverage.

## Status

| Item | Status |
|------|--------|
| CHANGELOG + `docs/COMMANDS.md` | ✅ |
| REPL e2e tests (mocked agent) | ✅ |
| `spark-cli config init` interactive | ✅ |
| `gen` / `ui` `--agent` + REPL `/gen` `/ui` `/level` `/anim` | ✅ (level/anim via agent prompts; CLI commands unchanged) |
| Editor Bridge → agent tools | ✅ `editor_scene_open`, `editor_selection_get` |
| Godot / Unreal / Unity MCP write | ✅ `stage_project_file` |
| Full migration of `gen`/`ui`/`level`/`anim` CLI off legacy codegen | ⏳ optional — use `--agent` or REPL |
| `@` refs, Tab completion, tool confirm, inline diff, `ui --agent` vision | ✅ |

## Deliverables

### Documentation

- [x] Root `CHANGELOG.md`
- [x] `docs/COMMANDS.md` — REPL, config, agent tools, MCP writes

### REPL

- [x] Default `spark-cli` → agent REPL
- [x] `src/commands/shell.repl.e2e.test.ts`
- [x] `processReplUserLine` export for tests

### Config

- [x] `spark-cli config init` — global wizard or project `init`
- [x] `spark-cli config show`

### Agent routing

- [x] `spark-cli gen --agent`, `spark-cli ui --agent`
- [x] `/gen`, `/ui`, `/level`, `/anim` slash → synthetic agent prompts

### Tools

- [x] Cocos Editor Bridge: `editor_scene_open`, `editor_selection_get`
- [x] MCP `stage_project_file` for godot / unreal / unity (when `mcp.allowWrite: true`)

## Acceptance

```bash
pnpm test
pnpm test:phase12
pnpm build
spark-cli config show
spark-cli --help   # lists config subcommand
```

## Out of scope (defer)

- Removing legacy `runGenerate` / `chat --legacy` entirely
- Live LLM integration tests (network)
- Unity scene graph MCP writers (use `stage_project_file` + agent file tools)
