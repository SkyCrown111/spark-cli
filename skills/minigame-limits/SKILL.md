---
name: minigame-limits
description: WeChat / Douyin / Alipay / Huawei package limits via platform_matrix
triggers: [minigame, wechat, douyin, alipay, huawei, subpackage, platform_matrix]
allowedTools: [read_file, glob, grep, load_skill]
---

## Primary tool

- **`platform_matrix`** — runs rule packs in `rules/*.json` against the project tree (read-only).

## Context

Minigame adapters layer on the detected engine. If the engine is wrong, fix **`project.engine`** in config or run from the real game project root before trusting matrix output.
