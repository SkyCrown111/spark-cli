# Contributing to SparkCLI

## Development setup

```bash
pnpm install
pnpm build
pnpm test
```

Run phase acceptance: `pnpm test:phase1` … `pnpm test:phase8`.

## Project structure

- `src/cli.ts` — Commander entry
- `src/commands/` — command handlers
- `src/core/` — staging, LLM, replay, plugins
- `src/engines/` — Cocos, Unity, WeChat, platform adapters
- `fixtures/` — test projects
- `docs/PHASE-N.md` — phase scope and acceptance

## Phase discipline

Work on the **current ROADMAP phase** only. See [docs/ROADMAP.md](./docs/ROADMAP.md).

## Pull requests

1. Branch from `main`
2. Keep changes focused on one phase or fix
3. Add or update tests for behavior changes
4. Update `docs/COMMANDS.md` if CLI surface changes
5. Ensure `pnpm typecheck` and `pnpm test` pass

## Plugin format

Place `spark-cli-plugin.json` in your plugin root:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Optional",
  "engines": ["cocos-creator"]
}
```

Install locally: `spark-cli plugin install ./path/to/plugin`

## Code style

Match existing TypeScript: ESM, minimal dependencies, staging-safe writes for file mutations.

## Questions

Open a GitHub issue using the templates in `.github/ISSUE_TEMPLATE/`.
