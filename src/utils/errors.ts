export class SparkCLIError extends Error {
  constructor(
    message: string,
    public readonly code: number = 1,
    public readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'SparkCLIError';
  }
}

export function exitWithError(err: unknown): never {
  if (err instanceof SparkCLIError) {
    console.error(err.message);
    if (err.hints.length) {
      for (const h of err.hints) console.error(`  → ${h}`);
    }
    process.exit(err.code);
  }
  if (err instanceof Error) {
    console.error(err.message);
    process.exit(1);
  }
  console.error(String(err));
  process.exit(1);
}
