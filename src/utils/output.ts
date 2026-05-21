export interface GlobalOptions {
  project?: string;
  config?: string;
  provider?: string;
  model?: string;
  json?: boolean;
  verbose?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  /** Print/one-shot mode prompt (non-interactive). */
  print?: string;
  /** Maximum agent turns in print mode. */
  maxTurns?: number;
  /** Maximum estimated USD spend. */
  maxBudgetUsd?: number;
  /** Custom system prompt (replaces default). */
  systemPrompt?: string;
  /** Append to default system prompt. */
  appendSystemPrompt?: string;
  /** Reasoning effort level. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Resume the most recent session. */
  continueSession?: boolean;
  /** Resume a specific session by ID. */
  resumeSession?: string;
  /** Load PR context (diff + comments) by PR number. */
  fromPr?: number;
  /** Run as a background agent (detached process). */
  bg?: boolean;
}

export function resolveProjectRoot(opts: GlobalOptions): string {
  return opts.project ?? process.cwd();
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
