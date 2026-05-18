# Acceptance checklist — Phases 1–4

Maps to product doc §E items scoped to Phases 1–4 (automation + manual).

| §E item | Status | How to verify |
|---------|--------|----------------|
| `spark-cli doctor` | Auto | `pnpm test:phase1` |
| Cocos fixture chat→apply→validate | Auto + manual | `pnpm test:phase1`; manual `chat` with API key |
| `ui` text path | Manual | `spark-cli ui "HUD"` — [vision.md](./vision.md) for image/figma |
| WeChat + Douyin `adapt` hot-update | Auto | `pnpm test:phase4`, `pnpm test:phase5` |
| MCP `allowWrite` policy | Auto | `pnpm test:phase3` |
| `replay export` | Auto | `pnpm test:phase8` |
| Docs match command tree | Review | [COMMANDS.md](./COMMANDS.md) |
| Offline without API key | Partial | `validate`, `build analyze`, `adapt`, `doctor` (no model test) |

## One-shot automation

```bash
pnpm test:phase1
pnpm test:phase2
pnpm test:phase3
pnpm test:phase4
pnpm test:phase8
```

## Manual (API key / tools)

- Cocos Creator build: `spark-cli build wechat`
- WeChat publish: `spark-cli publish wechat --env preview`
- Cursor MCP: [mcp.md](./mcp.md)
