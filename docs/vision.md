# Visual & design input (Phase 7)

Generate UI code from screenshots, Figma, or Sketch exports.

## Commands

```bash
# Screenshot → vision model (tasks.vision)
spark-cli ui --image ./designs/login.png "match this layout"

# Figma file (REST API)
export FIGMA_TOKEN=figfig-xxxx
spark-cli ui --figma "https://www.figma.com/design/FILE_KEY/My-File?node-id=1-2" "build HUD"

# Sketch exported JSON
spark-cli ui --sketch ./exports/login-screen.sketch.json "implement buttons"
```

Combine with text prompt or use design-only:

```bash
spark-cli ui --sketch fixtures/ui-input/login-screen.sketch.json
```

## Config

```yaml
tasks:
  vision:
    provider: openai
    model: gpt-4o

figma:
  token: figd_xxxx   # or FIGMA_TOKEN env
```

`ui --image` resolves **`tasks.vision`** (not the default chat model). Use a vision-capable model (`gpt-4o`, `gpt-4o-mini`, etc.).

## Sketch JSON format

Export from Sketch (plugin or manual). Minimal schema:

```json
{
  "name": "ScreenName",
  "width": 375,
  "height": 812,
  "layers": [
    { "name": "Button", "type": "rectangle", "x": 40, "y": 100, "width": 200, "height": 44 }
  ]
}
```

Example: `fixtures/ui-input/login-screen.sketch.json`

## Figma

1. Create a personal access token in Figma → Settings → Security.
2. Set `FIGMA_TOKEN` or `figma.token` in config.
3. Pass a `figma.com/design/...` or `figma.com/file/...` URL.

SparkCLI fetches layer names/types via the Figma Files API and injects a text summary into the UI prompt.

## E2E examples (manual)

| Input | Command |
|-------|---------|
| PNG | `spark-cli ui --image ./screen.png "login UI" --dry-run` |
| Figma | `spark-cli ui --figma "<url>" "main menu"` |
| Sketch | `spark-cli ui --sketch fixtures/ui-input/login-screen.sketch.json --dry-run` |

After generation: `spark-cli diff` → `spark-cli apply` → `spark-cli validate`.

## Automated tests

`pnpm test:phase7` — parsers and message builder (no live LLM/Figma calls).
