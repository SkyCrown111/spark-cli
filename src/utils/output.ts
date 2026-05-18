export interface GlobalOptions {
  project?: string;
  config?: string;
  provider?: string;
  model?: string;
  json?: boolean;
  verbose?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

export function resolveProjectRoot(opts: GlobalOptions): string {
  return opts.project ?? process.cwd();
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
