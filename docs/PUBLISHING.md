# Publishing SparkCLI to npm

## Prerequisites

- Node.js 20+
- npm account with publish access to `spark-cli` package name
- `pnpm build` passes locally

## Pre-publish checklist

```bash
pnpm typecheck
pnpm test
pnpm test:phase1
pnpm test:phase4
pnpm test:phase8
pnpm build
node dist/cli.js --version
```

## Publish (maintainers)

```bash
# Login once
npm login

# From repo root — prepublishOnly runs build
npm publish --access public
```

`package.json` `files` field ships: `dist/`, `knowledge/`, `rules/`, `extensions/`, `packages/`.

## Consumers

```bash
npm install -g spark-cli
spark-cli init
spark-cli doctor
```

## Versioning

Follow semver. Update `package.json` version and tag `vX.Y.Z` on release.
