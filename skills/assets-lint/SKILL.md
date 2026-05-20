---
name: assets-lint
description: Texture/audio/unused asset checks via assets_audit
triggers: [assets_audit, texture, audio, unused asset, asset audit]
allowedTools: [read_file, glob, grep, load_skill]
---

## Tooling

- **`assets_audit`** — read-only scan under `assets/` (optional `dir`, `disable` rules).
- **`assets_fix`** — stages fixes; needs **`mcp.allowWrite: true`** and user apply flow (`spark-cli diff` / `apply`).

## Tips

Pair **`glob`** (`assets/**/*.{png,jpg,mp3}`) with **`read_file`** on meta or small configs; keep responses bounded with `limit` on huge files.
