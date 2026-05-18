# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.3.x   | Yes       |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

1. Use [GitHub private vulnerability reporting](https://github.com/SkyCrown111/spark-cli/security/advisories/new) if enabled, or
2. Contact the maintainers via the email on their GitHub profile.

We aim to acknowledge reports within 5 business days.

## What to keep out of the repository

- API keys, tokens, `*.pem`, and provider secrets
- `spark-cli.config.yaml` files that contain real `api_key` values (use `key_env` + environment variables instead)
- `.spark-cli/` staging, backups, replay logs, and cache directories
- Personal machine paths in committed test artifacts

## Local configuration

- Global config: `~/.spark-cli/config.yaml` (not tracked by git)
- Project config: `spark-cli.config.yaml` in your game project root
- Copy `.env.example` to `.env` locally; `.env` is gitignored

## Safe defaults

- Tool writes default to **staging** until you `/apply` or enable `/auto`
- Sensitive tools prompt for confirmation in the interactive REPL
- MCP write tools require explicit `mcp.allowWrite: true` in config
