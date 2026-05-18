# SparkCLI MCP

## Cursor configuration

Add to `.cursor/mcp.json` (project) or user MCP settings:

```json
{
  "mcpServers": {
    "spark-cli": {
      "command": "node",
      "args": ["D:/path/to/spark-cli/dist/cli.js", "mcp", "serve"],
      "env": {
        "SPARK_CLI_PROJECT": "${workspaceFolder}"
      }
    }
  }
}
```

After `pnpm link --global`, you can use:

```json
{
  "mcpServers": {
    "spark-cli": {
      "command": "spark-cli",
      "args": ["mcp", "serve"],
      "env": {
        "SPARK_CLI_PROJECT": "${workspaceFolder}"
      }
    }
  }
}
```

Restart the MCP server after changing config.

## Resources (read-only)

| URI | Content |
|-----|---------|
| `spark-cli://project/info` | Engine version, model config, `mcp.allowWrite` / port |
| `spark-cli://project/structure` | Script paths, scan summary |
| `spark-cli://scene/tree` | First scene or `SPARK_CLI_SCENE` env |

## Tools — read-only (always available)

| Tool | Description |
|------|-------------|
| `scene_list` | List `.scene` files |
| `scene_analyze` | Parse scene JSON → node tree |
| `validate_project` | Run `spark-cli validate --json` |

## Tools — write (requires `mcp.allowWrite: true`)

Listed and callable only when write is enabled in merged config (`spark-cli.config.yaml` or `~/.spark-cli/config.yaml`):

```yaml
mcp:
  allowWrite: true
  port: 17321
```

| Tool | Description |
|------|-------------|
| `scene_add_node` | Add child node under `parentPath` → **staging** |
| `component_update` | Patch component fields on a node → **staging** |

Writes never apply directly. After MCP write tools:

```bash
spark-cli diff
spark-cli apply
```

## Example write tool calls

**scene_add_node**

```json
{
  "path": "assets/scenes/main.scene",
  "parentPath": "Canvas",
  "name": "HUD"
}
```

**component_update**

```json
{
  "path": "assets/scenes/main.scene",
  "nodePath": "Canvas",
  "componentType": "cc.UITransform",
  "properties": { "_enabled": false }
}
```

## Editor Bridge

Opening scenes in Cocos uses the WebSocket bridge, not MCP. See [bridge.md](./bridge.md).

## Phase 3 manual check (Cursor)

1. Open a Cocos fixture or project with `SPARK_CLI_PROJECT` set.
2. Confirm MCP resources `project/info` and `scene/tree` return JSON.
3. With `allowWrite: false`, confirm write tools are absent or return an error.
4. Set `allowWrite: true`, call `scene_add_node`, then `spark-cli diff` / `apply` in the terminal.
