import { z } from 'zod';

export const TaskModelSchema = z.object({
  provider: z.string().default('inherit'),
  model: z.string().default('inherit'),
});

export const CustomProviderSchema = z.object({
  name: z.string(),
  base_url: z.string().url(),
  model: z.string().optional(),
  api_key: z.string().optional(),
  api_mode: z.enum(['openai', 'anthropic', 'auto']).optional(),
  key_env: z.string().optional(),
});

export const FallbackProviderSchema = z.object({
  name: z.string(),
  model: z.string().optional(),
  priority: z.number().int().optional(),
});

export const McpServerConfigSchema = z.object({
  /** Unique name for this server (used in CLI and tool prefixing). */
  name: z.string(),
  /** Transport type: stdio spawns a process; sse/http connect via HTTP. */
  transport: z.enum(['stdio', 'sse', 'http']),
  /** For stdio: executable command. Supports ${VAR} expansion. */
  command: z.string().optional(),
  /** For stdio: command arguments. */
  args: z.array(z.string()).optional(),
  /** For stdio or sse/http: environment variables to pass. Supports ${VAR} expansion. */
  env: z.record(z.string()).optional(),
  /** For sse/http: server URL. Supports ${VAR} expansion. */
  url: z.string().optional(),
  /** For sse/http: additional HTTP headers. Supports ${VAR} expansion. */
  headers: z.record(z.string()).optional(),
  /** Whether this server is enabled. Default true. */
  enabled: z.boolean().optional(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const SparkCLIConfigSchema = z.object({
  project: z
    .object({
      root: z.string().optional(),
      engine: z.enum(['cocos-creator', 'unity', 'unreal', 'godot']).optional(),
      engineVersion: z.string().optional(),
      creatorPath: z.string().optional(),
      unityPath: z.string().optional(),
    })
    .optional(),
  model: z
    .object({
      default: z.string().optional(),
      provider: z.string().optional(),
      api_key: z.string().optional(),
      base_url: z.string().optional(),
    })
    .optional(),
  providers: z
    .object({
      custom_providers: z.array(CustomProviderSchema).optional(),
      fallback_providers: z.array(FallbackProviderSchema).optional(),
    })
    .optional(),
  provider: z
    .object({
      /**
       * Per-request `max_tokens` cap for completions.
       * Defaults to 4096; clamp at the model's hard cap.
       *
       * NOTE: This was previously `context.maxTokens` and was misused as an
       * output cap. `context.maxTokens` now refers to the history token budget
       * (used by the agent loop for compaction).
       */
      outputMaxTokens: z.number().int().positive().optional(),
      /**
       * Tool-use capability strategy. `auto` probes and demotes on first
       * tool-related 4xx; `native` trusts the gateway; `fallback` never sends
       * `tools` (only useful for diagnosing legacy gateways — the agent will
       * surface gateway errors rather than retrying).
       */
      toolsMode: z.enum(['auto', 'native', 'fallback']).optional(),
    })
    .optional(),
  tasks: z
    .object({
      chat: TaskModelSchema.optional(),
      gen: TaskModelSchema.optional(),
      ui: TaskModelSchema.optional(),
      vision: TaskModelSchema.optional(),
      embed: TaskModelSchema.optional(),
      level: TaskModelSchema.optional(),
      anim: TaskModelSchema.optional(),
    })
    .optional(),
  context: z
    .object({
      /**
       * History token budget. The agent loop compacts when usage exceeds 75%
       * of this. Distinct from `provider.outputMaxTokens` (per-request cap).
       */
      maxTokens: z.number().int().positive().optional(),
      priority: z.array(z.string()).optional(),
    })
    .optional(),
  ui: z
    .object({
      theme: z.string().optional(),
      showStatusLine: z.boolean().optional(),
      showThinking: z.boolean().optional(),
      /**
       * REPL renderer: `default` (main screen + native scrollback) or
       * `fullscreen` (alternate screen + Ink). Default: `default`.
       */
      renderer: z.enum(['default', 'fullscreen']).optional(),
    })
    .optional(),
  agent: z
    .object({
      /** Hard cap on ReAct iterations per turn. Default 25. */
      maxIterations: z.number().int().positive().optional(),
      /**
       * Max parallel tool calls per model iteration (semaphore in tool dispatcher).
       * Default 3. Distinct from sub-agent nesting limits.
       */
      toolDispatchConcurrency: z.number().int().positive().optional(),
    })
    .optional(),
  compaction: z
    .object({
      /** Fraction of context.maxTokens to trigger summarization. Default 0.75. */
      threshold: z.number().min(0).max(1).optional(),
      /** Number of trailing messages to keep verbatim. Default 6. */
      recentN: z.number().int().positive().optional(),
      /** Override model for the compaction call. Default same as parent. */
      model: z.string().optional(),
    })
    .optional(),
  hooks: z
    .object({
      /** Per-hook timeout in ms. Default 10000. */
      timeoutMs: z.number().int().positive().optional(),
      /** Allowed handler types. Default: all types enabled. */
      handlerTypes: z.array(z.enum(['command', 'script', 'http', 'prompt'])).optional(),
      /** When true, advisory hooks run asynchronously (non-blocking). Default false. */
      asyncAdvisory: z.boolean().optional(),
    })
    .optional(),
  tools: z
    .object({
      /** Allow tools to read/write paths outside the project root. Default false. */
      allowAbsolute: z.boolean().optional(),
      read: z
        .object({
          /** Per-call max bytes returned by read_file. Default 256 KB. */
          maxBytes: z.number().int().positive().optional(),
        })
        .optional(),
      write: z
        .object({
          /** Per-call max bytes accepted by write_file. Default 5 MB. */
          maxBytes: z.number().int().positive().optional(),
        })
        .optional(),
      bash: z
        .object({
          /** Default per-command timeout in ms. Default 30 000. Capped at 300 000. */
          timeoutMs: z.number().int().positive().optional(),
          /** Cap on bytes captured from stdout/stderr. Default 32 KB. */
          maxOutputBytes: z.number().int().positive().optional(),
        })
        .optional(),
      grep: z
        .object({
          /** Cap on the number of matches returned. Default 200. */
          maxMatches: z.number().int().positive().optional(),
        })
        .optional(),
      gen: z
        .object({
          image: z
            .object({
              enabled: z.boolean().optional(),
              provider: z.enum(['mock', 'openai', 'stability']).optional(),
            })
            .optional(),
          audio: z
            .object({
              enabled: z.boolean().optional(),
              provider: z.enum(['mock', 'elevenlabs']).optional(),
            })
            .optional(),
        })
        .optional(),
      web: z
        .object({
          /** Master switch for web_fetch / web_search. Default false. */
          enabled: z.boolean().optional(),
          /** Per-request timeout in ms. Default 15 000. */
          timeoutMs: z.number().int().positive().optional(),
          /** Cap on bytes returned per fetch. Default 256 KB. */
          maxBytes: z.number().int().positive().optional(),
          /** Allow-list of host patterns for web_fetch. Empty = all hosts. */
          allowHosts: z.array(z.string()).optional(),
          /** Block-list of host patterns. Applied after allowHosts. */
          blockHosts: z.array(z.string()).optional(),
          /** Search backend for web_search. Default "ddg". */
          searchBackend: z.enum(['ddg', 'none']).optional(),
        })
        .optional(),
    })
    .optional(),
  subagent: z
    .object({
      /** Hard cap on parent → child nesting (default 1; 0 = parent only). */
      maxDepth: z.number().int().min(0).optional(),
      /**
       * @deprecated Prefer `agent.toolDispatchConcurrency`. When set and
       * `agent.toolDispatchConcurrency` is unset, used as the per-iteration tool
       * dispatch concurrency (historical mis-name).
       */
      concurrency: z.number().int().positive().optional(),
      /** Override model used by sub-agents (e.g. cheaper model). */
      model: z.string().optional(),
      /** Iteration cap inside a sub-agent (default same as parent). */
      maxIterations: z.number().int().positive().optional(),
    })
    .optional(),
  session: z
    .object({
      /** Auto-save session after each agent turn. Default true. */
      autosave: z.boolean().optional(),
      /** Max age in days before sessions are auto-cleaned. Default 30. */
      maxAgeDays: z.number().int().positive().optional(),
    })
    .optional(),
  security: z
    .object({
      requireConfirm: z.boolean().optional(),
      backupBeforeWrite: z.boolean().optional(),
      /** Fine-grained permission rules using Tool(specifier) glob syntax.
       *  Evaluated in order; first match wins. Actions: deny/ask/allow.
       *  Examples: Tool(bash), Tool(write_file:src/**), Tool(*:.git/*)
       */
      toolRules: z
        .array(
          z.object({
            specifier: z.string(),
            action: z.enum(['deny', 'ask', 'allow']),
          }),
        )
        .optional(),
      /** Paths that are never auto-approved (even in acceptEdits/bypass mode).
       *  Default: ['.git', '.spark', '.spark-cli', '.vscode', '.claude', '.kiro', '.husky']
       */
      protectedPaths: z.array(z.string()).optional(),
      /** Persist "always allow" choices across sessions. Default true. */
      persistAlwaysAllow: z.boolean().optional(),
    })
    .optional(),
  sandbox: z
    .object({
      /** Enable sandbox mode. Default false. */
      enabled: z.boolean().optional(),
      /** Allowed file paths (glob patterns). Empty = all paths under project root. */
      allowPaths: z.array(z.string()).optional(),
      /** Denied file paths (glob patterns). Evaluated after allowPaths. */
      denyPaths: z.array(z.string()).optional(),
      /** Allowed domains for network access. Empty = all domains. */
      allowDomains: z.array(z.string()).optional(),
      /** Denied domains for network access. Evaluated after allowDomains. */
      denyDomains: z.array(z.string()).optional(),
      /** Auto-allow bash commands when sandbox is enabled. Default false. */
      autoAllowBash: z.boolean().optional(),
    })
    .optional(),
  mcp: z
    .object({
      allowWrite: z.boolean().optional(),
      port: z.number().int().optional(),
      /** MCP servers to connect to as a client. */
      servers: z.array(McpServerConfigSchema).optional(),
    })
    .optional(),
  wechat: z
    .object({
      devtoolsPath: z.string().optional(),
      appid: z.string().optional(),
    })
    .optional(),
  douyin: z
    .object({
      cliPath: z.string().optional(),
      appid: z.string().optional(),
    })
    .optional(),
  alipay: z
    .object({
      cliPath: z.string().optional(),
      appid: z.string().optional(),
    })
    .optional(),
  huawei: z
    .object({
      cliPath: z.string().optional(),
      appid: z.string().optional(),
    })
    .optional(),
  figma: z
    .object({
      token: z.string().optional(),
    })
    .optional(),
  editor: z
    .object({
      port: z.number().int().positive().optional(),
    })
    .optional(),
  cloud: z
    .object({
      enabled: z.boolean().optional(),
      endpoint: z.string().url().optional(),
      useCloudKeys: z.boolean().optional(),
      syncPaths: z.array(z.string()).optional(),
    })
    .optional(),
  git: z
    .object({
      /** Auto-commit after applying staged changes. Default false. */
      autoCommit: z.boolean().optional(),
    })
    .optional(),
  ignore: z.array(z.string()).optional(),
});

export type SparkCLIConfig = z.infer<typeof SparkCLIConfigSchema>;

export const DEFAULT_CONFIG: SparkCLIConfig = {
  project: { engine: 'cocos-creator' },
  model: { provider: 'auto' },
  session: { autosave: true, maxAgeDays: 30 },
  security: { requireConfirm: true, backupBeforeWrite: true },
  context: { maxTokens: 32000 },
  mcp: { allowWrite: false, port: 17321 },
};
