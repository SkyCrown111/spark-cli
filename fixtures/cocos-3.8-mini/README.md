# Cocos 3.8 mini fixture

Minimal layout for SparkCLI Phase 1 tests. Not a full Cocos Creator export — enough for `init`, `chat` staging, `tsc`, and `validate`.

## Layout

- `assets/scripts/` — generated scripts land here after `apply`
- `tsconfig.json` — strict TypeScript for `spark-cli validate`
- `package.json` — marks repo root for detector

## Use

```bash
cd fixtures/cocos-3.8-mini
pnpm install   # installs typescript for tsc
spark-cli init
spark-cli model use deepseek/deepseek-chat
export DEEPSEEK_API_KEY=sk-...
spark-cli doctor
spark-cli chat "hello component"
spark-cli apply
spark-cli validate
```

To test against a real Cocos 3.8 project, copy this `spark-cli.config.yaml` pattern into your game repo root.
