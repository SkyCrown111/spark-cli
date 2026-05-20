# Editor Bridge

SparkCLI talks to game editors over a local WebSocket (**Editor Bridge**).

## Requirements

- **Cocos Creator**: install `extensions/spark-cli-bridge` and keep the editor open.
- **Unity / Unreal**: use the packages under `packages/`; the editor must be running with the bridge extension enabled.

## Connection behavior

- Default URL: `ws://127.0.0.1:17322` (see `DEFAULT_BRIDGE_PORT` in `src/bridge/protocol.ts`).
- `bridgeRequest()` retries **refused** connections (editor still starting) up to **3 attempts** with **400ms** delay by default.
- Per-request timeout defaults to **5s** (`timeoutMs` option).

## Limitations

- Bridge tools only work while the editor process is online; there is no offline scene mutation.
- Unity/Unreal binary assets (`.uasset`, `.umap`) are not parsed offline — use bridge or staged text formats instead.

## Troubleshooting

```bash
spark-cli doctor --json | jq '.parity.engineMcp'
```

If connection fails after retries, confirm the extension is enabled and the port is not blocked by a firewall.
