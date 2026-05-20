---
name: cocos-workflow
description: Cocos Creator scenes, assets layout, and scene_list / scene_analyze tools
triggers: [cocos, Cocos Creator, .scene, scene_list, prefab]
allowedTools: [read_file, glob, grep, load_skill]
---

## When this applies

Use for **Cocos Creator** projects (`assets/`, `.scene` files, UUID meta files).

## Workflow

1. Discover scenes: call **`scene_list`** (MCP-adapted tool when engine is Cocos) or **`glob`** with `assets/**/*.scene`.
2. Inspect hierarchy: **`scene_analyze`** with a path from step 1.
3. Prefer **`read_file`** on small `.scene` slices or use `offset`/`limit` for large JSON.
4. Staging writes (`scene_add_node`, `component_update`, …) require `mcp.allowWrite: true` in config.

## Paths

- Scenes usually live under `assets/` (not repo root).
- Use **project-relative** paths in tools; on Windows avoid leading `/` on paths (use `assets/...`).
