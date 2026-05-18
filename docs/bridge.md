# SparkCLI Editor Bridge

WebSocket server inside Cocos Creator (`extensions/spark-cli-bridge`) so the CLI can drive the editor.

Default URL: `ws://127.0.0.1:17321` (same as `mcp.port` in `spark-cli.config.yaml`).

## Install in Cocos Creator 3.8+

1. Copy or symlink this repo folder:

   ```
   <your-cocos-project>/extensions/spark-cli-bridge
   ```

   Source: `spark-cli/extensions/spark-cli-bridge/`

2. Install extension dependencies (once):

   ```bash
   cd extensions/spark-cli-bridge
   npm install
   ```

3. **Extension → Extension Manager** → enable **spark-cli-bridge**.

4. Confirm the console shows: `[spark-cli-bridge] listening on ws://127.0.0.1:17321`

## CLI usage

From your Cocos project root:

```bash
spark-cli scene open assets/scenes/main.scene
spark-cli scene open assets/scenes/main.scene --json
```

## Protocol (JSON over WebSocket)

Request:

```json
{ "id": "uuid", "method": "scene.open", "params": { "path": "assets/scenes/main.scene" } }
```

Response:

```json
{ "id": "uuid", "ok": true, "result": { "opened": "assets/scenes/main.scene", "uuid": "..." } }
```

| Method | Params | Description |
|--------|--------|-------------|
| `scene.open` | `{ "path": "assets/scenes/main.scene" }` | Open scene in editor |
| `selection.get` | `{}` | Return selected node UUIDs |

## Port override

- Extension: `SPARK_CLI_BRIDGE_PORT=17399` before starting Cocos.
- CLI: set `mcp.port: 17399` in `spark-cli.config.yaml`.

## Manual verification (Phase 3 acceptance)

1. Open a Cocos 3.8 project with the extension enabled.
2. Run `spark-cli scene open assets/scenes/<your-scene>.scene`.
3. Confirm the scene tab opens in the editor.
4. Select a node in the hierarchy; use a WebSocket client to send `selection.get` and verify UUIDs in the response.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot connect to Editor Bridge` | Enable extension; check port; run `npm install` in extension folder |
| `Asset not found` | Use path relative to project, e.g. `assets/scenes/main.scene` |
| Port in use | Change `mcp.port` / `SPARK_CLI_BRIDGE_PORT` |

Scene **file** edits from MCP use staging (`spark-cli diff` / `apply`) and do not require the bridge.
