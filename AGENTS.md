# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Common commands

Package manager is **pnpm** (declared in `packageManager`); Node **20+** required.

```bash
pnpm install
pnpm build           # esbuild bundle: src/cli.ts → dist/cli.js (+ copies knowledge/, rules/, editor/public/)
pnpm dev             # esbuild --watch
pnpm typecheck       # tsc --noEmit (strict, noUnusedLocals/Parameters)
pnpm test            # vitest run — picks up src/**/*.test.ts (see vitest.config.ts)
node dist/cli.js …   # run the built CLI without `pnpm link`
```

Run a single test file or pattern:

```bash
pnpm exec vitest run src/core/staging/patch-manager.test.ts
pnpm exec vitest run -t "applies staged file"
```

Phase acceptance scripts (one per ROADMAP phase) live in `scripts/phaseN-accept.mjs`:

```bash
pnpm test:phase1   # … through pnpm test:phase11
```

## Architecture

### Entry point and command surface

`src/cli.ts` is the Commander entry (also the esbuild entrypoint). Every subcommand registered there delegates to a `runX` handler in `src/commands/`. Global flags (`--project`, `--config`, `--provider`, `--model`, `--json`, `--verbose`, `--yes`, `--dry-run`) are gathered by `collectGlobals` and threaded as `GlobalOptions` into every handler — when adding a new command, follow this pattern instead of reading `process.argv` directly.

Running `spark-cli` with no subcommand falls through to `runShell` (Codex-style REPL with `/diff`, `/apply`, `/model …` slash commands). `spark-cli chat` with no prompt does the same.

### Staging-safe writes (the central invariant)

All file mutations from AI-generated code go through `src/core/staging/patch-manager.ts`, which writes to `<project>/.spark-cli/staging/` plus a `manifest.json`. Nothing touches the user's project files until `spark-cli apply` runs. When adding any command that produces files, stage them — never write directly to the project root. `init` / `apply` / `revert` / `diff` are the user-facing surface for this; `runChat`, `runGen`, `runUi`, `runLevelNew`, `runAnimNew` etc. all stage.

Project-local state lives under `.spark-cli/` (staging, knowledge index, plugins, replay, adapt reports). Global config is `~/.spark-cli/config.yaml` — see `src/config/paths.ts` for the canonical path helpers.

### Multi-engine model

`src/engines/registry.ts` detects the active engine (`cocos-creator | unity | unreal | godot | unknown`) by probing project files; an explicit `project.engine` in config is verified before being trusted. Each engine has its own subdirectory under `src/engines/` containing detector, scene/asset parsers, build planners, and validators. Commands that behave per-engine (`gen`, `validate`, `build`) branch on the detected `EngineId`.

`src/engines/wechat/` and `src/platforms/registry.ts` handle minigame platforms (wechat / douyin / alipay / huawei) — these are platform adapters layered on top of the engine, with rule files in `rules/*.json` (also copied into `dist/rules/` at build time).

### LLM provider routing

`src/core/providers/registry.ts` defines built-in providers (openai, anthropic, deepseek, google, groq, ollama). `src/core/providers/router.ts` resolves the model for a given **task** (`chat`, `gen`, `ui`, `vision`, `embed`, `level`, `anim`) by consulting `tasks.<task>` in config, then `model.default`, then CLI overrides. `openai-compatible.ts` and `anthropic.ts` are the two API shapes; custom providers in `providers.custom_providers[]` declare which one via `api_mode`.

Important: `key_env` is an env-var **name**, not a key value. `resolveCustomProviderApiKey` flags misuse so `doctor` can surface it.

### Other components

- `src/mcp/` — MCP server exposing read/write tools to Cursor / Codex Desktop (`spark-cli mcp serve`), with `write-guard.ts` enforcing the staging invariant for tool-driven writes.
- `src/bridge/` — WebSocket client/protocol that talks to `extensions/spark-cli-bridge` (a Cocos Creator editor extension) for `scene open` and live editor ops.
- `src/cloud/` — SparkCLI Cloud client + a local mock server (`spark-cli cloud serve`). Auth, key vault, push/pull sync.
- `src/core/knowledge/` — BM25 over bundled `knowledge/*.md` plus project-local docs.
- `src/core/replay/` — `replay export` bundles prompts + staging diff + validation history into a single JSON.
- `src/core/plugin/` — local plugin loader (folder containing `spark-cli-plugin.json`).
- `editor/public/` — static assets for `spark-cli editor serve` (level/anim Web UI on port 17323).
- `packages/unity/com.spark-cli.bridge` — Unity editor package (UPM) consumed inside Unity, not by the CLI build.

### Build pipeline specifics

`scripts/build.mjs` uses esbuild with `packages: 'external'` — runtime deps stay in `node_modules` and are not bundled. After bundling, the script `cpSync`s `knowledge/`, `rules/`, `skills/`, and `editor/public/` into `dist/` because the CLI reads them at runtime relative to its own location. If you add a new runtime asset directory, add it to this script.

## Conventions

- ESM only (`"type": "module"`). Imports use the `.js` extension even for `.ts` source files (NodeNext-style under bundler resolution).
- TypeScript is `strict` with `noUnusedLocals` / `noUnusedParameters` — dead args must be prefixed `_` or removed.
- Tests are colocated as `*.test.ts` next to the unit under test; vitest only scans `src/**/*.test.ts`.
- Work is organized by **Phase** (see `docs/ROADMAP.md` and `docs/PHASE-N.md`). All phases 1–11 are complete; new work should reference an existing phase or ROADMAP audit item rather than introducing a new top-level scope.
- When changing the CLI surface, update `docs/COMMANDS.md` (per `CONTRIBUTING.md`).
