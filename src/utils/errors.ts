export class SparkCLIError extends Error {
  constructor(
    message: string,
    public readonly code: number = 1,
    public readonly hints: string[] = [],
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SparkCLIError';
  }
}

/**
 * Safely extract an error message from an unknown value.
 * Replaces unsafe patterns like `(e as Error).message`.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

/**
 * Safely execute a synchronous function, returning a fallback on error.
 * Replaces empty catch blocks with meaningful fallback behavior.
 */
export function safeExecute<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Safely execute an async function, returning a fallback on error.
 */
export async function safeExecuteAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
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
