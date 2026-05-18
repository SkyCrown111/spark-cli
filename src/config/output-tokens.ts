import type { SparkCLIConfig } from './schema.js';

/**
 * Resolve the per-request output token cap.
 *
 * Migration path:
 * - New canonical field: `provider.outputMaxTokens`.
 * - Old misused field: `context.maxTokens` was previously clamped at 8192 and
 *   passed as `max_tokens` to the API. We dual-read for one release and
 *   warn when only the old field is set.
 *
 * `context.maxTokens` is now reserved for the agent loop's history budget.
 * If both are set, `provider.outputMaxTokens` wins.
 */
const HARD_CAP = 8192;
const DEFAULT_OUTPUT = 4096;
const HISTORY_BUDGET_THRESHOLD = 16000; // values above this are clearly history budgets, not output caps

let warnedAboutLegacy = false;

export function resolveOutputMaxTokens(config: SparkCLIConfig): number {
  const fromProvider = config.provider?.outputMaxTokens;
  if (typeof fromProvider === 'number') {
    return Math.min(fromProvider, HARD_CAP);
  }

  const legacy = config.context?.maxTokens;
  if (typeof legacy === 'number') {
    // Heuristic: large values are history budgets, small values were the old
    // misused output cap. Don't try to clamp a 32000 history budget down to
    // 8192 and silently send it as an output cap.
    if (legacy >= HISTORY_BUDGET_THRESHOLD) {
      return DEFAULT_OUTPUT;
    }
    if (!warnedAboutLegacy) {
      warnedAboutLegacy = true;
      console.warn(
        '[spark-cli] context.maxTokens used as an output cap is deprecated. ' +
          'Move it to provider.outputMaxTokens; context.maxTokens now means history budget.',
      );
    }
    return Math.min(legacy, HARD_CAP);
  }

  return DEFAULT_OUTPUT;
}

/** Test-only: reset the once-per-process warning flag. */
export function _resetOutputTokensForTests(): void {
  warnedAboutLegacy = false;
}
